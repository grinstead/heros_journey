import { SceneKernel, Scene, makeScene, SceneStep } from "./Scene.js";
import { SceneScript, ScriptAction } from "./GameScript.js";
import { makeSpriteFromName } from "./Sprite.js";

export class World {
  constructor(kernel, startScene) {
    /** @private {SceneKernel} */
    this.kernel = kernel;
    /** @private {Map<string, Scene>} Maps the initialized scenes' names to their data */
    this.scenes = new Map([[startScene.sceneName, startScene]]);
    /** @type {Scene} The active scene */
    this.activeScene = startScene;
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
 * @returns {number}
 */
export function updateSceneTime(scene, time) {
  const newTime = time - scene.sceneTimeOffset;
  scene.stepSize = newTime - scene.sceneTime;
  scene.sceneTime = newTime;
  return newTime;
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
    default:
      throw new Error(`Unrecognized action type ${action.type}`);
  }
}
