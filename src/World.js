import { SceneKernel, Scene, makeScene, SceneStep } from "./Scene.js";
import { SceneScript, ScriptAction } from "./GameScript.js";
import { makeSpriteFromName } from "./Sprite.js";
import { arctan, magnitudeOf } from "./utils.js";
import { Hero } from "./Hero.js";

const HALF_PI = Math.PI / 2;

function CONTINUE() {
  return true;
}

/**
 * @typedef {Object} Camera
 * @property {number} x
 * @property {number} y
 * @property {number} zoom
 */
export let Camera;

export class World {
  constructor(kernel, startScene) {
    /** @private {SceneKernel} */
    this.kernel = kernel;
    /** @private {Map<string, Scene>} Maps the initialized scenes' names to their data */
    this.scenes = new Map([[startScene.sceneName, startScene]]);
    /** @type {Scene} The active scene */
    this.activeScene = startScene;
    /** @type {Camera} */
    this.camera = { x: 0, y: 0, zoom: 1 };
    /** @type {Camera} */
    this.targetCamera = { x: 0, y: 0, zoom: 1 };
    /** @type {number} This number is a bit confusing */
    this.cameraSpeed = 8;
  }

  /**
   * @param {string} sceneName
   */
  switchToScene(sceneName) {
    if (this.activeScene.name === sceneName) return;
    this.activeScene = this.getScene(sceneName);
  }

  /**
   * Gets (or initializes) the scene with the given name
   * @param {string} sceneName
   * @returns {Scene}
   */
  getScene(sceneName) {
    const scenes = this.scenes;
    let scene = scenes.get(sceneName);
    if (!scene) {
      scene = initScene(this.kernel, sceneName);
      scenes.set(sceneName, scene);
    }
    return scene;
  }

  /**
   *
   * @param {Scene} scene
   */
  adjustCamera(scene) {
    const { stepSize } = scene;

    const speed = this.cameraSpeed;
    const camera = this.camera;
    const target = this.targetCamera;

    camera.x = stepTowards(speed, stepSize, camera.x, target.x);
    camera.y = stepTowards(speed, stepSize, camera.y, target.y);
    camera.zoom = stepTowards(speed, stepSize, camera.zoom, target.zoom);
  }
}

/**
 * Start the world! Huzzah!
 * @param {SceneKernel} kernel
 */
export function initWorld(kernel) {
  return new World(kernel, initScene(kernel, kernel.gameScript.openingScene));
}

/**
 * @param {SceneKernel} kernel
 * @param {string} sceneName
 * @returns {Scene}
 */
function initScene(kernel, sceneName) {
  switch (sceneName) {
    default: {
      const scene = makeScene({
        kernel,
        sceneName,
        hero: new Hero(0),
      });

      return scene;
    }
  }
}

/**
 * Updates the room's time and step size
 * @param {Scene} scene
 * @param {number} time
 * @param {number} maxStepSize
 * @returns {number}
 */
export function updateSceneTime(scene, time, maxStepSize) {
  const newTime = time - scene.sceneTimeOffset;
  const stepSize = newTime - scene.sceneTime;

  if (stepSize <= maxStepSize) {
    scene.stepSize = newTime - scene.sceneTime;
    scene.sceneTime = newTime;
    return newTime;
  } else {
    const cappedTime = scene.sceneTime + maxStepSize;
    scene.stepSize = maxStepSize;
    scene.sceneTime = cappedTime;
    scene.sceneTimeOffset = time - cappedTime;
    return cappedTime;
  }
}

/**
 * @param {Scene} scene
 */
export function runSceneScript(scene) {
  // run all the active actions
  const activeActions = scene.activeActions;
  if (activeActions) {
    const length = activeActions.length;
    let removedSome = false;
    for (let i = 0; i < length; ++i) {
      const update = activeActions[i]();
      activeActions[i] = update;
      if (update == null) removedSome = true;
    }

    if (removedSome) {
      const remaining = activeActions.filter(Boolean);
      scene.activeActions = remaining.length ? remaining : null;
    }
  }

  let { scriptPosition } = scene;
  if (!scriptPosition || !scriptPosition.waitUntil()) return;

  const actions = scene.sceneScript.actions;
  let index = scriptPosition.index;
  let waitUntil = null;

  while (!(waitUntil && !waitUntil()) && ++index < actions.length) {
    waitUntil = runAction(scene, actions[index]);
  }
  scene.scriptPosition = index < actions.length ? { index, waitUntil } : null;
}

/**
 * Runs the action and returns the step
 * @param {Scene} scene
 * @param {ScriptAction} action
 * @returns {function():boolean}
 */
function runAction(scene, action) {
  console.log(`running ${action.type} action`);

  switch (action.type) {
    case "add": {
      const { objects } = scene;
      objects.push({
        name: action.name,
        x: action.x,
        y: action.y,
        z: action.z,
        direction: 0,
        speed: 0,
        sprite: makeSpriteFromName(action.sprite, scene.sceneTime),
        shadowRadius: action.shadowRadius,
        showDamageUntil: 0,
      });

      return CONTINUE;
    }
    case "play sound": {
      scene.audio.playNamedSound({}, action.sound);
      return CONTINUE;
    }
    case "wait": {
      const endTime = scene.sceneTime + action.seconds;
      return () => scene.sceneTime >= endTime;
    }
    case "change sprite": {
      const name = action.name;
      const obj = scene.objects.find((obj) => obj.name === name);
      if (!obj) {
        throw new Error(`No object with name ${name}`);
      }
      obj.sprite = makeSpriteFromName(action.sprite, scene.sceneTime);
      return CONTINUE;
    }
    case "move": {
      const { name, seconds, easeIn, easeOut } = action;
      const obj = scene.objects.find((obj) => obj.name === name);
      if (!obj) {
        throw new Error(`No object with name ${name}`);
      }

      const dx = action.x;
      const dy = action.y;
      const dz = action.z;
      const startX = obj.x;
      const startY = obj.y;
      const startZ = obj.z;
      const targetX = startX + dx;
      const targetY = startY + dy;
      const targetZ = startZ + dz;

      if (dx !== 0 || dy !== 0) {
        obj.direction = arctan(dy, dx);
      }

      const targetSpeed = magnitudeOf(dx, dy, 0) / seconds;
      const targetZSpeed = dz / seconds;

      const startTime = scene.sceneTime;

      addBasicPendingAction(scene, true, () => {
        const p = (scene.sceneTime - startTime) / seconds;
        if (p < 1) {
          obj.speed = calcSpeedEasing(targetSpeed, p, easeIn, easeOut);
          obj.zSpeed = calcSpeedEasing(targetZSpeed, p, easeIn, easeOut);
          return false;
        } else {
          obj.x = targetX;
          obj.y = targetY;
          obj.z = targetZ;
          obj.speed = 0;
          obj.zSpeed = 0;
          return true;
        }
      });

      return CONTINUE;
    }
    case "camera": {
      const { name } = action;
      if (name == null) {
        scene.cameraTarget = null;
      } else {
        const obj = scene.objects.find((obj) => obj.name === name);
        if (!obj) {
          throw new Error(`No object with name ${name}`);
        }

        scene.cameraTarget = obj;
      }

      return CONTINUE;
    }

    default:
      throw new Error(`Unrecognized action type ${action.type}`);
  }
}

/**
 * Keeps calling code until it returns true
 * @param {Scene} scene
 * @param {boolean} runImmediately
 * @param {function():boolean} code
 */
function addBasicPendingAction(scene, runImmediately, code) {
  if (runImmediately && code()) return;

  const wrapper = () => (code() ? null : wrapper);

  const activeActions = scene.activeActions;
  if (activeActions) {
    activeActions.push(wrapper);
  } else {
    scene.activeActions = [wrapper];
  }
}

function calcSpeedEasing(speed, percentage, easeIn, easeOut) {
  const p = Math.min(percentage, 1);

  if (easeIn && easeOut) {
    return speed * Math.sin(p * Math.PI) * HALF_PI;
  } else if (easeIn) {
    return speed * Math.sin(p * HALF_PI) * HALF_PI;
  } else if (easeOut) {
    return speed * Math.cos(p * HALF_PI) * HALF_PI;
  } else {
    return speed;
  }
}

function stepTowards(speed, stepSize, current, target) {
  const p = speed * stepSize;
  return p * target + (1 - p) * current;
}
