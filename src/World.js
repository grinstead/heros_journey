import { SceneKernel, Scene, makeScene } from "./Scene.js";
import { Hero } from "./Hero.js";

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

function stepTowards(speed, stepSize, current, target) {
  const p = speed * stepSize;
  return p * target + (1 - p) * current;
}
