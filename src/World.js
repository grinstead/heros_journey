import { SceneKernel, Scene, makeScene, Camera } from "./Scene.js";
import { Hero, BULLET_HEIGHT } from "./Hero.js";
import { startSceneScript } from "./SceneScriptRunner.js";

const MARGIN_X = 60;
const MARGIN_TOP = 200;
const MARGIN_BOTTOM = BULLET_HEIGHT;
const INNER_MARGIN = 100;
const DEFAULT_CAMERA_SPEED = 4;

export class World {
  constructor(kernel, startScene) {
    /** @type {SceneKernel} */
    this.kernel = kernel;
    /** @private {Map<string, Scene>} Maps the initialized scenes' names to their data */
    this.scenes = new Map([[startScene.sceneName, startScene]]);
    /** @type {Scene} The active scene */
    this.activeScene = startScene;
    /** @type {Camera} */
    this.camera = { x: 0, y: 0, zoom: 1 };
  }

  resetScene(sceneName) {
    this.scenes.delete(sceneName);
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
  adjustCamera(scene, jumpTo) {
    const { stepSize, sceneCamera } = scene;

    const camera = this.camera;
    let { speed, target } = sceneCamera;
    if (speed < 0) speed = DEFAULT_CAMERA_SPEED;
    if (speed === 0 || jumpTo) {
      camera.x = target.x;
      camera.y = target.y;
      camera.zoom = target.zoom;
    } else {
      camera.x = stepTowards(speed, stepSize, camera.x, target.x);
      camera.y = stepTowards(speed, stepSize, camera.y, target.y);
      camera.zoom = stepTowards(speed, stepSize, camera.zoom, target.zoom);
      // 1 / stepTowards(speed, stepSize, 1 / camera.zoom, 1 / target.zoom);
    }

    camera.x = Math.round(camera.x);
    camera.y = Math.round(camera.y);
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

      const script = kernel.gameScript.scripts.has(sceneName);
      if (script) {
        startSceneScript(scene, sceneName);
      }

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
 *
 * @param {Scene} scene
 * @param {{w: number, h:number}} display
 */
export function processSceneCamera(scene, display) {
  const { sceneBox, sceneCamera, hero } = scene;

  const targetCamera = sceneCamera.target;

  if (!sceneCamera.showHero) {
    const altTarget = sceneCamera.subtarget;
    if (!altTarget) return;

    targetCamera.x = altTarget.x;
    targetCamera.y = altTarget.y;

    return;
  }

  const heroX = hero.x;
  const heroY = hero.y + BULLET_HEIGHT;
  const altTarget = sceneCamera.subtarget;

  const cameraRx = display.w / 2;
  const cameraRy = display.h / 2;

  if (altTarget) {
    targetCamera.x = (heroX + altTarget.x) / 2;
    targetCamera.y = (heroY + altTarget.y + BULLET_HEIGHT) / 2;

    // keep the player in frame
    targetCamera.x = Math.min(
      Math.max(heroX + INNER_MARGIN + MARGIN_X - cameraRx, targetCamera.x),
      heroX - INNER_MARGIN - MARGIN_X + cameraRx
    );
    targetCamera.y = Math.min(
      Math.max(heroY + INNER_MARGIN + MARGIN_TOP - cameraRy, targetCamera.y),
      heroY - INNER_MARGIN - MARGIN_BOTTOM + cameraRy
    );
  } else {
    targetCamera.x = heroX;
    targetCamera.y = heroY;
  }

  targetCamera.x = Math.min(
    Math.max(sceneBox.left + cameraRx - MARGIN_X, targetCamera.x),
    sceneBox.right - cameraRx + MARGIN_X
  );
  targetCamera.y = Math.min(
    Math.max(sceneBox.bottom + cameraRy - MARGIN_BOTTOM, targetCamera.y),
    sceneBox.top - cameraRy + MARGIN_TOP
  );
}

function stepTowards(speed, stepSize, current, target) {
  const p = speed * stepSize;
  return p * target + (1 - p) * current;
}
