import { SceneStep, GameObject, Scene, fireBullet } from "../Scene.js";
import { SceneScriptRunner } from "../SceneScriptRunner.js";
import { arctan, interpolate, dirIsLeft, magnitudeOf } from "../utils.js";
import { killOffEnemy } from "./utils.js";

const ARM_HEIGHT = 350 - 192;
const ARM_LENGTH = 200 - 50;
const HEALTH = 100;
const MARGIN = 200;

const VILLAIN_HIT_SOUNDS = ["BigBadGuyHit1", "BigBadGuyHit2", "BigBadGuyHit3"];

/**
 * @typedef {Object} VillainState
 * @property {number} heroDirection
 */
let VillainState;

/**
 * @param {Scene} scene
 * @returns {VillainState}
 */
export function mainBossInitialState(scene) {
  return {
    heroDirection: 0,
  };
}

/**
 * @param {SceneScriptRunner} runner
 * @param {GameObject} object
 * @returns {SceneStep}
 */
export function mainBossMain(runner, object) {
  const scene = runner.scene;
  const sceneBox = scene.sceneBox;
  const trueStartTime = scene.sceneTime;
  scene.inFight++;

  let goingUp = true;
  let biasRight = scene.hero.x < object.x;

  let startTime = trueStartTime;
  let bulletCooldown = startTime;
  let sweepCooldown = startTime + 1;
  let pulseCooldown = startTime;

  const height = scene.sceneBox.top - scene.sceneBox.bottom;
  const centerY = height / 2 + scene.sceneBox.bottom;

  let blastCount = 0;

  let prevDamage = object.damage;

  function moveToSide() {
    if (scene.sceneTime >= sweepCooldown) {
      return sweep;
    }

    let dx = 0;
    let targetY =
      0.5 * height * Math.sin(scene.sceneTime - trueStartTime) + centerY;
    let dy = targetY - object.y;

    const hero = scene.hero;
    if (biasRight && hero.x > sceneBox.right - 800) {
      biasRight = false;
    } else if (!biasRight && hero.x < sceneBox.left + 800) {
      biasRight = true;
    }

    if (biasRight) {
      if (object.x < sceneBox.right - MARGIN) {
        dx = 600;
      }
    } else {
      if (object.x > sceneBox.left + MARGIN) {
        dx = -600;
      }
    }

    object.speed = magnitudeOf(dx, dy, 0);
    object.direction = arctan(dy, dx);

    while (bulletCooldown < scene.sceneTime) {
      bulletCooldown += 0.125;
      fire();
    }

    // if (pulseCooldown < scene.sceneTime) {
    //   pulseCooldown = scene.sceneTime + 4;
    //   for (let i = 0; i < 60; i++) {
    //   }
    // }

    return moveToSide;
  }

  function sweep() {
    object.speed = 0;
    const sceneTime = scene.sceneTime;

    if (sceneTime >= startTime + 2) {
      sweepCooldown = sceneTime + 4;
      return moveToSide;
    }

    while (bulletCooldown < sceneTime) {
      bulletCooldown += 0.04;
      let angle = Math.abs(2 * Math.sin(4 * (bulletCooldown - startTime)));
      for (let i = -angle; i <= angle; i += angle / 2) {
        fire(i);
      }
    }

    return sweep;
  }

  function fire(offset = 0) {
    fireBullet(
      scene,
      object.x,
      object.y,
      ARM_HEIGHT,
      ARM_LENGTH,
      object.mirrorX ? Math.PI : 0,
      500,
      false,
      stateOf(object).heroDirection + offset
    );
  }

  let activeAction = moveToSide;
  function Action() {
    if (object.damage >= HEALTH) {
      return killOffEnemy(scene, object, makeBigBadGuyDying, "BigBadGuyDying");
    }

    if (object.damage !== prevDamage) {
      prevDamage = object.damage;
      scene.audio.playOneOf(object, VILLAIN_HIT_SOUNDS);
    }

    const state = stateOf(object);
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
