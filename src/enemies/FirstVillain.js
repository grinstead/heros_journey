import { SceneStep, GameObject } from "../Scene.js";
import { SceneScriptRunner } from "../SceneScriptRunner.js";

/**
 * @param {SceneScriptRunner} runner
 * @param {GameObject} object
 * @returns {SceneStep}
 */
export function firstVillainMain(runner, object) {
  console.log("START");

  return () => {
    console.log("END");
    return null;
  };
}
