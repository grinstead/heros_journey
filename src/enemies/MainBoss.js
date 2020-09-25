import { SceneStep, GameObject, Scene, fireBullet } from "../Scene.js";
import { SceneScriptRunner } from "../SceneScriptRunner.js";
import { arctan, interpolate, dirIsLeft, magnitudeOf } from "../utils.js";
import { killOffEnemy } from "./utils.js";

const ARM_HEIGHT = 254 - 158;
const ARM_LENGTH = 92;
const HEALTH = 40;
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
  scene.inFight++;

  let goingUp = true;
  let biasRight = scene.hero.x < object.x;

  let startTime = scene.sceneTime;
  let bulletCooldown = startTime + 1;

  let blastCount = 0;

  let prevDamage = object.damage;

  let activeAction = () => activeAction;
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
