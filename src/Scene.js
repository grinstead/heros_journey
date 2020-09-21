import { InputManager } from "../wattle/engine/src/InputManager.js";
import { AudioManager } from "./AudioManager.js";

/**
 * @typedef {Object} GameObjects
 * @property {number} x
 * @property {number} y
 * @property {number} direction
 * @property {number} speed
 */
export let GameObjects;

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
 */
export let Box;

/**
 * A data structure containing almost everything relevant for the game
 * @typedef {Object} Scene
 * @property {string} sceneName - The name of the scene
 * @property {InputManager} input - The inputs the user is giving
 * @property {AudioManager} audio - The audio context for the game
 * @property {number} sceneTime - The time (in seconds, accurate to ms) since the start of the scene
 * @property {number} sceneTimeOffset - The time to subtract from Date.now() to get sceneTime
 * @property {number} stepSize - The time (in seconds, accurate to ms) since the last render
 * @property {Box} sceneBox
 * @property {?Transition} entering - The transition that brought us here
 * @property {?Transition} exiting - The transition that is taking us away from here
 */
export let Scene;

/**
 *
 * @typedef {Object} SceneKernel
 * @property {InputManager} input - The inputs the user is giving
 * @property {AudioManager} audio - The audio context for the game
 */
export let SceneKernel;

/**
 * Makes a scene data structure object
 * @param {Object} options
 * @param {SceneKernel} options.kernel
 * @param {string} options.sceneName - The name of the scene
 * @param {Box} options.sceneBox - The bounding box of the scene
 * @returns {Scene}
 */
export function makeScene(options) {
  const { kernel } = options;

  return {
    name: options.sceneName,
    input: kernel.input,
    audio: kernel.audio,
    sceneTime: 0,
    sceneTimeOffset: offsetAFrameFrom(0),
    stepSize: 0,
    sceneBox: options.sceneBox,
    entering: null,
    exiting: null,
  };
}

export function offsetAFrameFrom(time) {
  return Date.now() / 1000 - 1 / 60 - time;
}
