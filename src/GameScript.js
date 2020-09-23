import { Box } from "./Scene.js";
import {
  parseRawObject,
  processObjectMap,
  processKey,
  readNum,
  processArray,
  readOneOf,
  processObjectArray,
  readString,
  validateString,
  hasKey,
  readBoolean,
} from "./PettyParser.js";

/**
 * @typedef {Object} ScriptAction;
 */
export let ScriptAction;

/**
 * @typedef {Object} SceneScript
 * @property {Box} sceneBox
 * @property {!Array<ScriptAction>} actions
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
  const spriteNames = [];
  const soundNames = [];
  processObjectArray("assets", () => {
    const type = readOneOf("type", ["animated", "static", "audio"]);
    if (type === "audio") {
      soundNames.push(readString("name"));
    } else {
      spriteNames.push(readString("name"));
    }
  });

  const scenes = processObjectMap("scenes", (name) => {
    const sceneBox = processKey("location", () => {
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

    const actionTypes = [
      "add",
      "play sound",
      "wait",
      "change sprite",
      "move",
      "camera",
    ];

    const knownNames = new Set();
    const readKnownName = () =>
      validateString(
        "name",
        (name) =>
          !knownNames.has(name) && "is trying to modify an unrecognized name"
      );

    const actions = processObjectArray("actions", (action) => {
      const type = readOneOf("type", actionTypes);

      switch (type) {
        case "add": {
          const name = readString("name");
          knownNames.add(name);
          return {
            type,
            name,
            sprite: readOneOf("sprite", spriteNames),
            x: readNum("x"),
            y: readNum("y"),
            z: hasKey("z") ? readNum("z") : 0,
            shadowRadius: processKey("shadow radius", () => ({
              x: readNum("x", 0),
              y: readNum("y", 0),
            })),
          };
        }
        case "play sound":
          return {
            type,
            sound: readOneOf("sound", soundNames),
          };
        case "wait":
          return {
            type,
            seconds: readNum("seconds", 0),
          };
        case "change sprite":
          return {
            type,
            name: readKnownName(),
            sprite: readOneOf("sprite", spriteNames),
          };
        case "move":
          return {
            type,
            name: readKnownName(),
            seconds: readNum("seconds", 0),
            x: hasKey("x") ? readNum("x") : 0,
            y: hasKey("y") ? readNum("y") : 0,
            z: hasKey("z") ? readNum("z") : 0,
            easeIn: hasKey("ease in") && readBoolean("ease in"),
            easeOut: hasKey("ease out") && readBoolean("ease out"),
          };
        case "camera":
          return {
            type,
            name: hasKey("name") ? readKnownName() : null,
          };
      }
    });

    return { sceneBox, actions };
  });

  const openingScene = validateString(
    "opening scene",
    (val) => !scenes.has(val) && "is not one of the given scenes"
  );

  return { openingScene, scenes };
}
