import { SceneKernel, Scene, makeScene, SceneStep } from "./Scene.js";
import { SceneScript, ScriptAction } from "./GameScript.js";
import { makeSpriteFromName } from "./Sprite.js";
import { arctan, magnitudeOf } from "./utils.js";

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
        sceneBox: { left: 0, right: 960, top: 0, bottom: 640 },
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
      const name = action.name;
      const obj = scene.objects.find((obj) => obj.name === name);
      if (!obj) {
        throw new Error(`No object with name ${name}`);
      }

      const seconds = action.seconds;
      const dx = action.x;
      const dy = action.y;
      const dz = action.z;
      const targetX = obj.x + dx;
      const targetY = obj.y + dy;
      const targetZ = obj.z + dz;

      if (dx !== 0 || dy !== 0) {
        obj.direction = arctan(dy, dx);
      }
      obj.speed = magnitudeOf(dx, dy, 0) / seconds;
      obj.zSpeed = dz / seconds;

      const endTime = scene.sceneTime + seconds;

      addBasicPendingAction(scene, () => {
        if (scene.sceneTime < endTime) return false;

        obj.x = targetX;
        obj.y = targetY;
        obj.z = targetZ;
        obj.speed = 0;
        obj.zSpeed = 0;
        return true;
      });

      return CONTINUE;
    }
    default:
      throw new Error(`Unrecognized action type ${action.type}`);
  }
}

/**
 * Keeps calling code until it returns true
 * @param {Scene} scene
 * @param {function():boolean} code
 */
function addBasicPendingAction(scene, code) {
  const wrapper = () => (code() ? null : wrapper);

  const activeActions = scene.activeActions;
  if (activeActions) {
    activeActions.push(wrapper);
  } else {
    scene.activeActions = [wrapper];
  }
}
