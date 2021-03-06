import { SceneStep, Scene, GameObject } from "./Scene.js";
import { SceneScript, ScriptAction } from "./GameScript.js";
import { makeSpriteFromName } from "./Sprite.js";
import { arctan, magnitudeOf } from "./utils.js";
import { addNamedState, initialStateFor } from "./enemies/EnemyAi.js";

/**
 * @typedef {Object} SceneScriptRunner
 * @property {Scene} scene
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
    scene,
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
    if (runScriptRunner(runner)) {
      scriptFinished = true;
    }
  });

  if (scriptFinished) {
    scene.scripts = scene.scripts.filter(
      (r) => r.scriptPosition || r.activeActions
    );
  }
}

/**
 *
 * @param {SceneScriptRunner} runner
 */
function runScriptRunner(runner) {
  let scriptFinished = false;
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

  if (!scriptPosition || !scriptPosition.waitUntil()) return scriptFinished;

  const actions = runner.sceneScript.actions;
  let index = scriptPosition.index;
  let waitUntil = null;

  while (!(waitUntil && !waitUntil()) && ++index < actions.length) {
    waitUntil = runAction(runner.scene, runner, actions[index]);
  }

  if (index < actions.length) {
    runner.scriptPosition = { index, waitUntil };
  } else {
    runner.scriptPosition = null;
    if (!runner.activeActions) scriptFinished = true;
  }

  return scriptFinished;
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
    case "do": {
      const subRunner = {
        scene,
        sceneScript: scene.gameScript.scripts.get(action.script),
        scriptPosition: UNSTARTED,
        activeActions: null,
      };

      addBasicPendingAction(runner, true, () => {
        return runScriptRunner(subRunner);
      });

      return CONTINUE;
    }
    case "add": {
      const { objects } = scene;

      let x = action.x;
      let y = action.y;

      if (action.absolute) {
        x -= scene.sceneBox.originX;
        y -= scene.sceneBox.originY;
      }

      objects.push({
        name: action.name,
        x,
        y,
        z: action.z,
        mirrorX: scene.hero.x < x,
        direction: 0,
        speed: 0,
        sprite: makeSpriteFromName(action.sprite, scene.sceneTime),
        shadowRadius: action.shadowRadius,
        showDamageUntil: 0,
        damage: 0,
        other: initialStateFor(scene, action.name),
        render: null,
      });

      return CONTINUE;
    }
    case "remove": {
      scene.objects = scene.objects.filter((obj) => obj.name !== action.name);
      return CONTINUE;
    }
    case "play sound": {
      scene.audio.playNamedSound({}, action.sound);
      return CONTINUE;
    }
    case "play music": {
      window["bgMusic"] = action.music;
      return CONTINUE;
    }
    case "wait": {
      const seconds = action.seconds;
      if (seconds != null) {
        const endTime = scene.sceneTime + action.seconds;
        return () => scene.sceneTime >= endTime;
      } else {
        return () => runner.activeActions == null;
      }
    }
    case "wait until within": {
      const { x, y } = action;
      const obj = findObject(scene, action.name);
      return () =>
        Math.abs(scene.hero.x - obj.x) < x &&
        Math.abs(scene.hero.y - obj.y) < y;
    }
    case "change sprite": {
      const name = action.name;
      const obj = findObject(scene, name);
      obj.sprite = makeSpriteFromName(action.sprite, scene.sceneTime);
      return CONTINUE;
    }
    case "change state": {
      const name = action.name;
      const obj = findObject(scene, action.name);
      const maybe = addNamedState(runner, obj, action.state);
      return maybe || CONTINUE;
    }
    case "change hero head": {
      const hero = scene.hero;
      const oldHead = hero.head;
      const head = makeSpriteFromName(action.sprite, scene.sceneTime);
      hero.head = head;
      addBasicPendingAction(runner, true, () => {
        if (!head.isFinished()) return false;

        oldHead.updateTime(scene.sceneTime);
        hero.head = oldHead;
        return true;
      });

      return CONTINUE;
    }
    case "move": {
      const { name, seconds, easeIn, easeOut, absolute } = action;
      const isHero = name === "hero";

      const obj = isHero
        ? scene.hero
        : scene.objects.find((obj) => obj.name === name);

      if (!obj) {
        throw new Error(`No object with name ${name}`);
      }

      let dx, dy;
      if (absolute) {
        dx = action.x - scene.sceneBox.originX - obj.x;
        dy = action.y - scene.sceneBox.originY - obj.y;
      } else {
        dx = action.x;
        dy = action.y;
      }

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
        obj.mirrorX = dx < 0;

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
      sceneCamera.showHero = action.showHero;
      sceneCamera.speed = -1;

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

      sceneCamera.showHero = false;
      sceneCamera.target.x = x - scene.sceneBox.originX;
      sceneCamera.target.y = y - scene.sceneBox.originY;
      sceneCamera.target.zoom = zoom;
      sceneCamera.speed = action.speed;
      sceneCamera.subtarget = null;

      return CONTINUE;
    }
    case "change hero visibility": {
      scene.hero.hidden = !action.visible;
      return CONTINUE;
    }
    case "transition": {
      scene.exiting = action.nextScreen;
      return CONTINUE;
    }
    case "free hero": {
      scene.hero.bounds = scene.sceneBox;
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

/**
 *
 * @param {Scene} scene
 * @param {string} name
 * @returns {GameObject}
 */
function findObject(scene, name) {
  const obj = scene.objects.find((obj) => obj.name === name);
  if (!obj) {
    throw new Error(`No object with name ${name}`);
  }
  return obj;
}
