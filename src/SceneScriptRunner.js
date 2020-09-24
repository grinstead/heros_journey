import { SceneStep, Scene } from "./Scene.js";
import { SceneScript, ScriptAction } from "./GameScript.js";
import { makeSpriteFromName } from "./Sprite.js";
import { arctan, magnitudeOf } from "./utils.js";

/**
 * @typedef {Object} SceneScriptRunner
 * @property {SceneScript} sceneScript
 * @property {?{index: number, waitUntil: function():boolean}} scriptPosition
 * @property {?Array<SceneStep>} activeActions
 */
export let SceneScriptRunner;

const HALF_PI = Math.PI / 2;

function CONTINUE() {
  return true;
}

const UNSTARTED = { index: -1, waitUntil: CONTINUE };

/**
 *
 * @param {Scene} scene
 * @param {string} scriptName
 */
export function startSceneScript(scene, scriptName) {
  const sceneScript = scene.gameScript.scripts.get(scriptName);
  if (!sceneScript) {
    throw new Error(`No script with name ${scriptName}`);
  }

  scene.scripts.push({
    sceneScript,
    scriptPosition: UNSTARTED,
    activeActions: null,
  });
}

/**
 * @param {Scene} scene
 */
export function runSceneScripts(scene) {
  let scriptFinished = false;

  scene.scripts.forEach((runner) => {
    const { activeActions, scriptPosition } = runner;

    // run all the active actions
    if (activeActions) {
      const length = activeActions.length;
      let removedSome = false;
      for (let i = 0; i < length; ++i) {
        const update = activeActions[i]();
        activeActions[i] = update;
        if (update == null) removedSome = true;
      }

      if (removedSome) {
        const remaining = activeActions.filter(Boolean);
        if (remaining.length) {
          runner.activeActions = remaining;
        } else {
          runner.activeActions = null;
          if (!runner.scriptPosition) scriptFinished = true;
        }
      }
    }

    // run the main script

    if (!scriptPosition || !scriptPosition.waitUntil()) return;

    const actions = runner.sceneScript.actions;
    let index = scriptPosition.index;
    let waitUntil = null;

    while (!(waitUntil && !waitUntil()) && ++index < actions.length) {
      waitUntil = runAction(scene, runner, actions[index]);
    }

    if (index < actions.length) {
      runner.scriptPosition = { index, waitUntil };
    } else {
      runner.scriptPosition = null;
      if (!runner.activeActions) scriptFinished = true;
    }
  });

  if (scriptFinished) {
    scene.scripts = scene.scripts.filter(
      (r) => r.scriptPosition || r.activeActions
    );
  }
}

/**
 * Runs the action and returns the step
 * @param {Scene} scene
 * @param {SceneScriptRunner} runner
 * @param {ScriptAction} action
 * @returns {function():boolean}
 */
function runAction(scene, runner, action) {
  console.log(
    `${runner.sceneScript.scriptName}: running ${action.type} action`
  );

  switch (action.type) {
    case "add": {
      const { objects } = scene;
      objects.push({
        name: action.name,
        x: action.x,
        y: action.y,
        z: action.z,
        direction: 0,
        speed: 0,
        sprite: makeSpriteFromName(action.sprite, scene.sceneTime),
        shadowRadius: action.shadowRadius,
        showDamageUntil: 0,
      });

      return CONTINUE;
    }
    case "play sound": {
      scene.audio.playNamedSound({}, action.sound);
      return CONTINUE;
    }
    case "wait": {
      const seconds = action.seconds;
      if (seconds != null) {
        const endTime = scene.sceneTime + action.seconds;
        return () => scene.sceneTime >= endTime;
      } else {
        return () => scene.activeActions == null;
      }
    }
    case "change sprite": {
      const name = action.name;
      const obj = scene.objects.find((obj) => obj.name === name);
      if (!obj) {
        throw new Error(`No object with name ${name}`);
      }
      obj.sprite = makeSpriteFromName(action.sprite, scene.sceneTime);
      return CONTINUE;
    }
    case "move": {
      const { name, seconds, easeIn, easeOut } = action;
      const isHero = name === "hero";

      const obj = isHero
        ? scene.hero
        : scene.objects.find((obj) => obj.name === name);

      if (!obj) {
        throw new Error(`No object with name ${name}`);
      }

      const dx = action.x;
      const dy = action.y;
      const dz = action.z;
      const startX = obj.x;
      const startY = obj.y;
      const startZ = isHero ? 0 : obj.z; // hack for now
      const targetX = startX + dx;
      const targetY = startY + dy;
      const targetZ = startZ + dz;

      if (dx !== 0 || dy !== 0) {
        obj.direction = arctan(dy, dx);
      }

      const targetSpeed = magnitudeOf(dx, dy, 0) / seconds;
      const targetZSpeed = dz / seconds;

      const startTime = scene.sceneTime;

      const processStep = () => {
        const p = (scene.sceneTime - startTime) / seconds;
        if (p < 1) {
          obj.speed = calcSpeedEasing(targetSpeed, p, easeIn, easeOut);
          obj.zSpeed = calcSpeedEasing(targetZSpeed, p, easeIn, easeOut);
          return false;
        } else {
          obj.x = targetX;
          obj.y = targetY;
          obj.z = targetZ;
          obj.speed = 0;
          obj.zSpeed = 0;
          return true;
        }
      };

      if (isHero) {
        const isFinished = scene.hero.changeToScriptedState(scene, processStep);
        addBasicPendingAction(runner, true, isFinished);
      } else {
        addBasicPendingAction(runner, true, processStep);
      }

      return CONTINUE;
    }
    case "camera": {
      const { name, zoom } = action;
      const sceneCamera = scene.sceneCamera;
      sceneCamera.target.zoom = zoom;
      sceneCamera.absolute = false;

      if (name == null) {
        sceneCamera.subtarget = null;
      } else {
        const obj = scene.objects.find((obj) => obj.name === name);
        if (!obj) {
          throw new Error(`No object with name ${name}`);
        }

        sceneCamera.subtarget = obj;
      }

      return CONTINUE;
    }
    case "absolute camera": {
      let { x, y, zoom } = action;
      const { sceneCamera } = scene;

      sceneCamera.absolute = true;
      sceneCamera.target.x = x - scene.sceneBox.originX;
      sceneCamera.target.y = y - scene.sceneBox.originY;
      sceneCamera.target.zoom = zoom;

      return CONTINUE;
    }
    case "fight": {
      scene.inFight = true;
      return CONTINUE;
    }

    default:
      throw new Error(`Unrecognized action type ${action.type}`);
  }
}

/**
 * Keeps calling code until it returns true
 * @param {SceneScriptRunner} runner
 * @param {boolean} runImmediately
 * @param {function():boolean} code
 */
function addBasicPendingAction(runner, runImmediately, code) {
  if (runImmediately && code()) return;

  const wrapper = () => (code() ? null : wrapper);

  const activeActions = runner.activeActions;
  if (activeActions) {
    activeActions.push(wrapper);
  } else {
    runner.activeActions = [wrapper];
  }
}

function calcSpeedEasing(speed, percentage, easeIn, easeOut) {
  const p = Math.min(percentage, 1);

  if (easeIn && easeOut) {
    return speed * Math.sin(p * Math.PI) * HALF_PI;
  } else if (easeIn) {
    return speed * 2 * p;
  } else if (easeOut) {
    return speed * 2 * (1 - p);
  } else {
    return speed;
  }
}
