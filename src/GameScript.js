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
import { namedStateExists } from "./enemies/EnemyAi.js";

export const PIXELS_PER_UNIT = 0.5;
export const FULL_SPACE_ZOOM = 1 / 6;

/**
 * @typedef {Object} ScriptAction;
 */
export let ScriptAction;

/**
 * @typedef {Object} SceneScript
 * @property {string} scriptName
 * @property {!Set<string>} characters
 * @property {!Array<ScriptAction>} actions
 */
export let SceneScript;

/**
 * @typedef {Object} SceneInfo
 * @property {Box} sceneBox
 */
export let SceneInfo;

/**
 * @typedef {Object} GameScript
 * @property {string} openingScene
 * @property {!Map<string, SceneInfo>} scenes
 * @property {!Map<string, GameCode>} scripts
 */
export let GameScript;

/**
 * @returns !Promise<GameScript>
 */
export async function loadUpGameScript() {
  try {
    const response = await fetch("./assets/GameScript.json");
    const plainScript = await response.text();

    return parseRawObject(plainScript, () => parseGameScript());
  } catch (error) {
    alert(String(error));
  }
}

/**
 * @returns {GameScript}
 */
function parseGameScript() {
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

  const changeXToWorld = (x) =>
    (x - 960 / 2) / PIXELS_PER_UNIT / FULL_SPACE_ZOOM;
  const changeYToWorld = (y) =>
    (y - 640 / 2) / PIXELS_PER_UNIT / -FULL_SPACE_ZOOM;

  const scenes = processObjectMap("scenes", (name) => {
    const sceneBox = processKey("location", () => {
      let originX = changeXToWorld(readNum("x"));
      let originY = changeYToWorld(readNum("y"));
      const width = readNum("width", 0, Number.POSITIVE_INFINITY, false);
      const height = readNum("height", 0, Number.POSITIVE_INFINITY, false);

      return {
        left: -width / 2,
        right: width / 2,
        top: height / 2,
        bottom: -height / 2,
        originX,
        originY,
      };
    });

    return {
      sceneBox,
      heroTotalHealth: hasKey("health") ? readNum("health", 0) : 20,
    };
  });

  const scriptNames = [];
  processObjectMap("scripts", (scriptName) => {
    scriptNames.push(scriptName);
  });

  const scripts = processObjectMap("scripts", (scriptName) => {
    const characters = new Set();
    const actionTypes = [
      "do",
      "add",
      "remove",
      "play sound",
      "play music",
      "wait",
      "wait until within",
      "change sprite",
      "change state",
      "change hero head",
      "free hero",
      "move",
      "camera",
      "absolute camera",
      "change hero visibility",
      "fight",
      "transition",
    ];

    processArray("characters", (name) => {
      if (typeof name !== "string") throw "is supposed to be a string";
      characters.add(name);
    });

    const readCharacterName = () =>
      validateString(
        "name",
        (name) =>
          !characters.has(name) &&
          "is trying to modify an unrecognized character"
      );

    const actions = processObjectArray("actions", (action) => {
      const type = readOneOf("type", actionTypes);

      switch (type) {
        case "do": {
          return {
            type,
            script: readOneOf("script", scriptNames),
          };
        }
        case "add": {
          const absolute = hasKey("absolute") && readBoolean("absolute");
          let x = readNum("x");
          let y = readNum("y");

          if (absolute) {
            x = changeXToWorld(x);
            y = changeYToWorld(y);
          }

          return {
            type,
            name: readCharacterName(),
            sprite: readOneOf("sprite", spriteNames),
            absolute,
            x,
            y,
            z: hasKey("z") ? readNum("z") : 0,
            shadowRadius: hasKey("shadow radius")
              ? processKey("shadow radius", () => ({
                  x: readNum("x", 0),
                  y: readNum("y", 0),
                }))
              : null,
          };
        }
        case "remove": {
          return { type, name: readCharacterName() };
        }
        case "play sound":
          return {
            type,
            sound: readOneOf("sound", soundNames),
          };
        case "play music":
          return {
            type,
            music: `assets/${readString("music")}`,
          };
        case "wait":
          return {
            type,
            seconds: hasKey("seconds") ? readNum("seconds", 0) : null,
          };
        case "wait until within":
          return {
            type,
            name: readCharacterName(),
            x: readNum("x", 0),
            y: readNum("y", 0),
          };
        case "change sprite":
          return {
            type,
            name: readCharacterName(),
            sprite: readOneOf("sprite", spriteNames),
          };
        case "change state":
          return {
            type,
            name: readCharacterName(),
            state: validateString(
              "state",
              (name) => !namedStateExists(name) && "is not a known state"
            ),
          };
        case "change hero head":
          return {
            type,
            sprite: readOneOf("sprite", spriteNames),
          };
        case "move": {
          const absolute = hasKey("absolute") && readBoolean("absolute");
          let x = hasKey("x") ? readNum("x") : 0;
          let y = hasKey("y") ? readNum("y") : 0;

          if (absolute) {
            x = changeXToWorld(x);
            y = changeYToWorld(y);
          }

          return {
            type,
            name: readCharacterName(),
            seconds: readNum("seconds", 0),
            absolute,
            x,
            y,
            z: hasKey("z") ? readNum("z") : 0,
            easeIn: hasKey("ease in") && readBoolean("ease in"),
            easeOut: hasKey("ease out") && readBoolean("ease out"),
          };
        }
        case "camera":
          return {
            type,
            name: hasKey("name") ? readCharacterName() : null,
            zoom: hasKey("zoom") ? readNum("zoom", 0, 1, true) : 1,
            showHero: hasKey("show hero") ? readBoolean("show hero") : true,
          };
        case "absolute camera":
          return {
            type,
            x: changeXToWorld(readNum("x")),
            y: changeYToWorld(readNum("y")),
            zoom: readNum("zoom", 0, 1, true),
            speed: hasKey("speed") ? readNum("speed") : -1,
          };
        case "change hero visibility":
          return {
            type,
            visible: readBoolean("visible"),
          };
        case "transition":
          return {
            type,
            nextScreen: validateString(
              "next screen",
              (val) => !scenes.has(val) && "is not one of the given scenes"
            ),
          };
        default:
          return { type };
      }
    });

    return { scriptName, actions, characters };
  });

  const openingScene = validateString(
    "opening scene",
    (val) => !scenes.has(val) && "is not one of the given scenes"
  );

  return { openingScene, scenes, scripts };
}
