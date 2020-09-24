import { InputManager } from "../wattle/engine/src/InputManager.js";
import { AudioManager } from "./AudioManager.js";
import { Sprite } from "./Sprite.js";
import { SceneScript, GameScript } from "./GameScript.js";
import { Hero } from "./Hero.js";
import { SceneScriptRunner } from "./SceneScriptRunner.js";

/**
 * @typedef {{x: number, y: number}} ShadowRadius
 */
export let ShadowRadius;

/**
 * @typedef {Object} Camera
 * @property {number} x
 * @property {number} y
 * @property {number} zoom
 */
export let Camera;

/**
 * @typedef {Object} GameObject
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} direction
 * @property {number} speed
 * @property {number} zSpeed
 * @property {Sprite} sprite
 * @property {ShadowRadius} shadowRadius
 * @property {number} showDamageUntil
 */
export let GameObject;

/**
 * @typedef {Object} Transition
 * @property {string} sceneName
 * @property {string} transitionType
 * @property {number} realWorldStartTime - ie. Date.now() / 1000
 * @property {number} seconds - The duration
 */
export let Transition;

/**
 * @typedef {Object} Box
 * @property {number} left
 * @property {number} right
 * @property {number} top
 * @property {number} bottom
 * @property {number} originX
 * @property {number} originY
 */
export let Box;

/**
 * @typedef {function():?SceneStep} SceneStep
 */
export let SceneStep;

/**
 * @typedef {Object}
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} dx
 * @property {number} dy
 * @property {boolean} isFriendly
 * @property {number} startTime
 * @property {boolean} isDead
 * @property {ShadowRadius} shadowRadius
 */
export let Bullet;

/**
 * A data structure containing almost everything relevant for the game
 * @typedef {Object} Scene
 * @property {string} sceneName - The name of the scene
 * @property {GameScript} gameScript
 * @property {InputManager} input - The inputs the user is giving
 * @property {AudioManager} audio - The audio context for the game
 * @property {number} sceneTime - The time (in seconds, accurate to ms) since the start of the scene
 * @property {number} sceneTimeOffset - The time to subtract from Date.now() to get sceneTime
 * @property {number} stepSize - The time (in seconds, accurate to ms) since the last render
 * @property {Box} sceneBox
 * @property {{target: Camera, speed: number, showHero: boolean, subtarget: ?{x:number,y:number}}} sceneCamera
 * @property {!Hero} hero
 * @property {!Array<GameObject>} objects
 * @property {!Array<Bullet>} bullets - Sorted by x
 * @property {!Array<SceneScriptRunner>} scripts
 * @property {boolean} inFight
 * @property {?Transition} entering - The transition that brought us here
 * @property {?Transition} exiting - The transition that is taking us away from here
 */
export let Scene;

/**
 *
 * @typedef {Object} SceneKernel
 * @property {InputManager} input - The inputs the user is giving
 * @property {AudioManager} audio - The audio context for the game
 * @property {GameScript} gameScript
 */
export let SceneKernel;

/**
 * Makes a scene data structure object
 * @param {Object} options
 * @param {SceneKernel} options.kernel
 * @param {string} options.sceneName - The name of the scene
 * @param {!Hero} options.hero
 * @returns {Scene}
 */
export function makeScene(options) {
  const { kernel, sceneName } = options;

  const gameScript = kernel.gameScript;
  const sceneInfo = gameScript.scenes.get(sceneName);
  if (!sceneInfo) {
    throw new Error(`No info for scene ${sceneName}`);
  }

  return {
    sceneName,
    gameScript,
    input: kernel.input,
    audio: kernel.audio,
    sceneTime: 0,
    sceneTimeOffset: offsetAFrameFrom(0),
    stepSize: 0,
    sceneBox: sceneInfo.sceneBox,
    sceneCamera: {
      speed: -1,
      showHero: true,
      target: { x: 0, y: 0, zoom: 1 },
      subtarget: null,
    },
    hero: options.hero,
    objects: [],
    bullets: [],
    scripts: [],
    inFight: false,
    entering: null,
    exiting: null,
  };
}

export function offsetAFrameFrom(time) {
  return Date.now() / 1000 - 1 / 60 - time;
}
