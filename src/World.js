import { SceneKernel, Scene, makeScene } from "./Scene.js";

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
  return new World(kernel, initScene(kernel, "start"));
}

/**
 * @param {SceneKernel} kernel
 * @param {string} sceneName
 * @returns {Scene}
 */
function initScene(kernel, sceneName) {
  switch (sceneName) {
    case "start": {
      const scene = makeScene({
        kernel,
        sceneName,
        sceneBox: { left: 0, right: 960, top: 0, bottom: 640 },
      });

      return scene;
    }
    default:
      throw new Error(`Unrecognized scene name "${sceneName}"`);
  }
}

/**
 * Updates the room's time and step size
 * @param {Scene} scene
 * @param {number} time
 */
export function updateSceneTime(scene, time) {
  const newTime = time - scene.sceneTimeOffset;
  scene.stepSize = newTime - scene.sceneTime;
  scene.sceneTime = newTime;
}
