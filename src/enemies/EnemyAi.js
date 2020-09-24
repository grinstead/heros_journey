import { SceneScriptRunner } from "../SceneScriptRunner.js";
import { firstVillainMain } from "./FirstVillain.js";
import { SceneStep, GameObject } from "../Scene.js";

/** @type {!Map<string, function(SceneScriptRunner,GameObject):SceneStep>} */
const namedStates = new Map();

namedStates.set("first villain main", firstVillainMain);

/**
 *
 * @param {SceneScriptRunner} runner
 * @param {GameObject} object
 * @param {string} name
 * @returns {?function():boolean}
 */
export function addNamedState(runner, object, name) {
  const builder = namedStates.get(name);
  if (!builder) {
    throw new Error(`Unrecognized state ${name}`);
  }

  const action = builder(runner, object)();

  if (action != null) {
    runner.activeActions.push(action);
  }
}

/**
 *
 * @param {string} name
 * @returns {boolean}
 */
export function namedStateExists(name) {
  return namedStates.has(name);
}
