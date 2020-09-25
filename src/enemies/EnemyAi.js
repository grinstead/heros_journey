import { SceneScriptRunner } from "../SceneScriptRunner.js";
import { firstVillainMain, firstVillainInitialState } from "./FirstVillain.js";
import { SceneStep, GameObject, Scene } from "../Scene.js";
import { prisonerShaking, prisonerKnockedOver } from "./Prisoner.js";
import { bigBadInitialState, bigBadMain } from "./BigBad.js";

/** @type {!Map<string, function(Scene):?>} */
const initStates = new Map();

/** @type {!Map<string, function(SceneScriptRunner,GameObject):SceneStep>} */
const namedStates = new Map();

initStates.set("first", firstVillainInitialState);
initStates.set("first1", firstVillainInitialState);
initStates.set("first2", firstVillainInitialState);
namedStates.set("first villain main", firstVillainMain);

namedStates.set("shaking", prisonerShaking);
namedStates.set("knocked over", prisonerKnockedOver);

initStates.set("big", bigBadInitialState);
namedStates.set("big bad main", bigBadMain);

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
    const activeActions = runner.activeActions;
    if (activeActions) {
      activeActions.push(action);
    } else {
      runner.activeActions = [action];
    }
  }

  return null;
}

/**
 *
 * @param {string} name
 * @returns {boolean}
 */
export function namedStateExists(name) {
  return namedStates.has(name);
}

/**
 *
 * @param {Scene} scene
 * @param {string} name
 * @returns {?}
 */
export function initialStateFor(scene, name) {
  const maybe = initStates.get(name);
  return maybe ? maybe(scene) : null;
}
