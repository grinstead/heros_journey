import { SceneStep, GameObject, Scene, fireBullet } from "../Scene.js";
import { SceneScriptRunner } from "../SceneScriptRunner.js";
import { Sprite, subrenderSprite } from "../Sprite.js";
import {
  makeFirstVillainArm,
  makeFirstVillainDying,
  makeFirstVillainWalking,
} from "../assets.js";
import {
  subrender,
  shiftContent,
  rotateAboutY,
} from "../../wattle/engine/src/swagl/MatrixStack.js";
import { arctan, interpolate } from "../utils.js";
import { killOffEnemy } from "./utils.js";

const ARM_HEIGHT = 178 - 118;
const ARM_LENGTH = 95 - 2;
const HEALTH = 30;
const SWEEP_TIME = 0.5;
const MAX_STAGE = 8;

const VILLAIN_HIT_SOUNDS = [
  "FirstVillainHit1",
  "FirstVillainHit2",
  "FirstVillainHit3",
];

/**
 * @typedef {Object} VillainState
 * @property {number} heroDirection
 * @property {number} dirOffset
 * @property {!Sprite} armSprite
 * @property {number} stage
 */
let VillainState;

/**
 * @param {Scene} scene
 * @returns {VillainState}
 */
export function firstVillainInitialState(scene) {
  const stage = scene.sceneName !== "call to action" ? 3 : 0;

  return {
    heroDirection: 0,
    dirOffset: 0,
    armSprite: makeFirstVillainArm(scene.sceneTime),
    stage: stage,
    startStage: stage,
  };
}

/**
 * @param {SceneScriptRunner} runner
 * @param {GameObject} object
 * @returns {SceneStep}
 */
export function firstVillainMain(runner, object) {
  const scene = runner.scene;
  scene.inFight++;

  object.sprite = makeFirstVillainWalking(scene.sceneTime);

  object.render = () => {
    const state = stateOf(object);

    subrender(() => {
      shiftContent(0, 0, ARM_HEIGHT);

      let angle = state.heroDirection + state.dirOffset;
      if (object.mirrorX) angle = Math.PI - angle;

      rotateAboutY(angle);
      state.armSprite.prepareSpriteType();
      subrenderSprite(state.armSprite);
    });

    const sprite = object.sprite;
    sprite.prepareSpriteType();
    subrenderSprite(sprite);
  };

  let startTime = scene.sceneTime;
  let bulletCooldown = 0;
  let sweepCooldown = startTime + 2;

  function fireSweep() {
    const step = () => {
      const sceneTime = scene.sceneTime;
      const state = stateOf(object);

      if (sceneTime - startTime > SWEEP_TIME) {
        state.dirOffset = 0;
        bulletCooldown = sceneTime + 0.2;
        sweepCooldown = startTime + interpolate(state.stage, MAX_STAGE, 2, 0.4);
        return fireSimple;
      }

      while (sceneTime >= bulletCooldown) {
        const dirOffset = interpolate(
          bulletCooldown - startTime,
          SWEEP_TIME,
          0.8,
          -0.8
        );
        state.dirOffset = dirOffset;

        bulletCooldown += 0.02;

        fireBullet(
          scene,
          object.x,
          object.y,
          ARM_HEIGHT,
          ARM_LENGTH,
          state.heroDirection + dirOffset,
          300,
          false
        );
      }

      return step;
    };

    return step;
  }

  function fireSimple() {
    const sceneTime = scene.sceneTime;
    if (stateOf(object).stage > 0 && sceneTime >= sweepCooldown) {
      return fireSweep;
    }

    if (sceneTime > bulletCooldown) {
      bulletCooldown = sceneTime + 0.2;
      fireBullet(
        scene,
        object.x,
        object.y,
        ARM_HEIGHT,
        ARM_LENGTH,
        stateOf(object).heroDirection,
        300,
        false
      );
    }

    return fireSimple;
  }

  let prevDamage = object.damage;

  let activeAction = fireSimple;
  function Action() {
    if (object.damage >= HEALTH) {
      return killOffEnemy(
        scene,
        object,
        makeFirstVillainDying,
        "FirstVillainDyingSound"
      );
    }

    if (object.damage !== prevDamage) {
      prevDamage = object.damage;
      scene.audio.playOneOf(object, VILLAIN_HIT_SOUNDS);
    }

    const state = stateOf(object);
    state.stage = Math.min(
      MAX_STAGE,
      Math.floor(object.damage / 5) + state.startStage
    );

    // 90 degrees off center, forms a circle
    object.direction = arctan(object.x, -object.y);
    object.speed = 200 + 50 * state.stage;
    const hero = scene.hero;
    state.heroDirection = arctan(hero.y - object.y, hero.x - object.x);
    object.mirrorX = hero.x < object.x;

    let newAction = activeAction();
    while (newAction && newAction !== activeAction) {
      startTime = scene.sceneTime;
      activeAction = newAction;
      newAction = newAction();
    }
    activeAction = newAction;

    return activeAction && Action;
  }

  return Action;
}

/**
 *
 * @param {GameObject} object
 * @returns {VillainState}
 */
function stateOf(object) {
  return object.other;
}
