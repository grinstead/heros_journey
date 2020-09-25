import { SceneStep, GameObject, Scene, fireBullet } from "../Scene.js";
import { SceneScriptRunner } from "../SceneScriptRunner.js";
import { Sprite, subrenderSprite } from "../Sprite.js";
import {
  makeBigBadGuyDying,
  makeBigBadGuy,
  makeBigBadGuyShooting,
} from "../assets.js";
import {
  subrender,
  shiftContent,
  rotateAboutY,
} from "../../wattle/engine/src/swagl/MatrixStack.js";
import { arctan, interpolate, dirIsLeft, magnitudeOf } from "../utils.js";
import { killOffEnemy } from "./utils.js";

const ARM_HEIGHT = 254 - 158;
const ARM_LENGTH = 92;
const HEALTH = 20;
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
export function bigBadInitialState(scene) {
  return {
    heroDirection: 0,
  };
}

/**
 * @param {SceneScriptRunner} runner
 * @param {GameObject} object
 * @returns {SceneStep}
 */
export function bigBadMain(runner, object) {
  const scene = runner.scene;
  const sceneBox = scene.sceneBox;
  const height = sceneBox.top - sceneBox.bottom;
  scene.inFight++;

  let goingUp = true;
  let biasRight = scene.hero.x < object.x;

  let startTime = scene.sceneTime;
  object.sprite = makeBigBadGuyShooting(startTime); //makeBigBadGuy(startTime);

  let bulletCooldown = startTime + 1;

  let blastCount = 0;

  function returnToMarching() {
    object.sprite = makeBigBadGuy(scene.sceneTime);
    return upAndDown;
  }

  function upAndDown() {
    if (goingUp && object.y > sceneBox.top - MARGIN) {
      goingUp = false;
    } else if (!goingUp && object.y < sceneBox.bottom + MARGIN) {
      goingUp = true;
    }

    let dy = goingUp ? 400 : -400;

    let dx = 0;
    const hero = scene.hero;
    if (biasRight && hero.x > sceneBox.right - 800) {
      biasRight = false;
    } else if (!biasRight && hero.x < sceneBox.left + 800) {
      biasRight = true;
    }

    if (biasRight) {
      if (object.x < sceneBox.right - MARGIN) {
        dx = 200;
      }
    } else {
      if (object.x > sceneBox.left + MARGIN) {
        dx = -200;
      }
    }

    object.speed = magnitudeOf(dx, dy, 0);
    object.direction = arctan(dy, dx);

    blastCount = 0;
    return bulletCooldown < scene.sceneTime ? fireBlast : upAndDown;
  }

  function fireBlast() {
    blastCount++;
    const sceneTime = scene.sceneTime;
    object.sprite = makeBigBadGuyShooting(sceneTime);
    object.speed = 0;
    bulletCooldown = sceneTime + 2;

    const arc = Math.PI - 0.125;
    const rayStart = stateOf(object).heroDirection - arc / 2;
    const count = 60;
    const increment = arc / count;
    const gunDir = object.mirrorX ? Math.PI : 0;

    for (let i = 0; i < count; i++) {
      fireBullet(
        scene,
        object.x,
        object.y,
        ARM_HEIGHT,
        ARM_LENGTH,
        gunDir,
        500,
        false,
        rayStart + i * increment
      );
    }

    const wait = () => {
      if (object.sprite.isFinished()) {
        if (object.damage >= blastCount * 2.5) {
          return fireBlast;
        }

        return returnToMarching;
      } else {
        return wait;
      }
    };

    return wait;
  }

  let prevDamage = object.damage;

  let activeAction = upAndDown;
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
