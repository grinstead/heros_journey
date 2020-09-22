import { SceneKernel, Scene, makeScene, SceneStep } from "./Scene.js";
import { SceneScript, ScriptAction } from "./GameScript.js";
import { makeSpriteFromName } from "./Sprite.js";
import { arctan, magnitudeOf } from "./utils.js";

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
  let { scriptPosition } = scene;
  if (!scriptPosition) return;

  let nextStep = scriptPosition.run(scene);
  if (nextStep) {
    scriptPosition.run = nextStep;
  } else {
    let ranStep = false;
    let index = scriptPosition.index;
    while (!ranStep) {
      index++;
      const actions = scene.sceneScript.actions;
      if (index < actions.length) {
        nextStep = runAction(scene, actions[index]);
        if (nextStep) {
          ranStep = true;
          scene.scriptPosition = { index, run: nextStep };
        }
      } else {
        ranStep = true;
        scene.scriptPosition = null;
      }
    }
  }
}

/**
 * Runs the action and returns the step
 * @param {Scene} scene
 * @param {ScriptAction} action
 * @returns {?SceneStep}
 */
function runAction(scene, action) {
  switch (action.type) {
    case "add": {
      const { objects } = scene;
      objects.push({
        name: action.name,
        x: action.x,
        y: action.y,
        direction: 0,
        speed: 0,
        sprite: makeSpriteFromName(action.sprite, scene.sceneTime),
      });

      return null;
    }
    case "play sound": {
      scene.audio.playNamedSound({}, action.sound);
      return null;
    }
    case "wait": {
      const endTime = scene.sceneTime + action.seconds;

      const waitForIt = (scene) =>
        scene.sceneTime < endTime ? waitForIt : null;

      return waitForIt;
    }
    case "change sprite": {
      const name = action.name;
      const obj = scene.objects.find((obj) => obj.name === name);
      if (!obj) {
        throw new Error(`No object with name ${name}`);
      }
      obj.sprite = makeSpriteFromName(action.sprite, scene.sceneTime);
      return null;
    }
    case "move": {
      const name = action.name;
      const obj = scene.objects.find((obj) => obj.name === name);
      if (!obj) {
        throw new Error(`No object with name ${name}`);
      }

      const dx = action.x - obj.x;
      const dy = action.y - obj.y;
      if (dx === 0 && dy === 0) return null;

      const seconds = action.seconds;
      obj.direction = arctan(dy, dx);
      obj.speed = magnitudeOf(dx, dy, 0) / seconds;

      const endTime = scene.sceneTime + seconds;

      const waitForIt = (scene) => {
        if (scene.sceneTime < endTime) return waitForIt;

        obj.x = action.x;
        obj.y = action.y;
        obj.speed = 0;
        return null;
      };

      return waitForIt;
    }
    default:
      throw new Error(`Unrecognized action type ${action.type}`);
  }
}
