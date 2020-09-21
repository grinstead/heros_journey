import { Box } from "./Scene.js";
import {
  parseRawObject,
  processMap,
  processKey,
  readNum,
  readString,
} from "./PettyParser.js";

/**
 * @typedef {Object} SceneScript
 * @property {Box} sceneBox
 */
export let SceneScript;

/**
 * @typedef {Object} GameScript
 * @property {string} openingScene
 * @property {!Map<string, SceneScript>} scenes
 */
export let GameScript;

/**
 * @param {number} circleRadius
 * @returns !Promise<GameScript>
 */
export async function loadUpGameScript(circleRadius) {
  try {
    const response = await fetch("./assets/GameScript.json");
    const plainScript = await response.text();

    return parseRawObject(plainScript, () => parseGameScript(circleRadius));
  } catch (error) {
    alert(String(error));
  }
}

/**
 * @param {number} circleRadius
 * @returns {GameScript}
 */
function parseGameScript(circleRadius) {
  const scenes = processMap("scenes", (scene, name) => {
    const sceneBox = processKey("location", (pos) => {
      const clock = readNum("clock position", 0, 12, true);
      const width = readNum("width", 0, Number.POSITIVE_INFINITY, false);
      const height = readNum("height", 0, Number.POSITIVE_INFINITY, false);

      const angle = Math.PI / 2 - 2 * Math.PI * (clock / 12);

      const centerX = circleRadius * Math.cos(angle);
      const centerY = circleRadius * Math.sin(angle);

      return {
        left: centerX - width / 2,
        right: centerX + width / 2,
        top: centerY + height / 2,
        bottom: centerY - height / 2,
      };
    });

    return { sceneBox };
  });

  const openingScene = processKey("opening scene", (val) => {
    if (typeof val !== "string") {
      throw "is supposed to be text";
    }

    if (!scenes.has(val)) {
      throw "is not one of the given scenes";
    }

    return val;
  });

  return { openingScene, scenes };
}
