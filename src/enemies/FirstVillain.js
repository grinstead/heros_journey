import { SceneStep, GameObject, Scene, fireBullet } from "../Scene.js";
import { SceneScriptRunner } from "../SceneScriptRunner.js";
import { Sprite, subrenderSprite } from "../Sprite.js";
import { makeFirstVillainArm, makeFirstVillainDying } from "../assets.js";
import {
  subrender,
  shiftContent,
  rotateAboutY,
} from "../../wattle/engine/src/swagl/MatrixStack.js";
import { arctan } from "../utils.js";
import { killOffEnemy } from "./utils.js";

const ARM_HEIGHT = 178 - 118;
const ARM_LENGTH = 95 - 2;
const HEALTH = 10;

/**
 * @typedef {Object} VillainState
 * @property {number} armDirection
 * @property {!Sprite} armSprite
 */
let VillainState;

/**
 * @param {Scene} scene
 * @returns {VillainState}
 */
export function firstVillainInitialState(scene) {
  return {
    armDirection: 0,
    armSprite: makeFirstVillainArm(scene.sceneTime),
  };
}

/**
 * @param {SceneScriptRunner} runner
 * @param {GameObject} object
 * @returns {SceneStep}
 */
export function firstVillainMain(runner, object) {
  const scene = runner.scene;

  object.render = () => {
    const state = stateOf(object);

    subrender(() => {
      shiftContent(0, 0, ARM_HEIGHT);
      rotateAboutY(state.armDirection);
      state.armSprite.prepareSpriteType();
      subrenderSprite(state.armSprite);
    });

    const sprite = object.sprite;
    sprite.prepareSpriteType();
    subrenderSprite(sprite);
  };

  let bulletCooldown = 0;

  function fireSimple() {
    const sceneTime = scene.sceneTime;
    if (sceneTime > bulletCooldown) {
      bulletCooldown = sceneTime + 1;

      const { armDirection } = stateOf(object);
      fireBullet(
        scene,
        object.x,
        object.y,
        ARM_HEIGHT,
        ARM_LENGTH,
        armDirection,
        300,
        false
      );
    }

    return fireSimple;
  }

  let activeAction = fireSimple;
  function Action() {
    if (object.damage >= HEALTH) {
      return killOffEnemy(scene, object, makeFirstVillainDying);
    }

    const state = stateOf(object);
    const hero = scene.hero;
    state.armDirection = arctan(hero.y - object.y, hero.x - object.x);

    activeAction = activeAction();

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
