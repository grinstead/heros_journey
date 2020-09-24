import {
  makeHeroHead,
  makePistolArm,
  makeHeroRunning,
  makeHeroBodyStatic,
  makeHeroRunningBackwards,
  makeHeroJump,
  makeHeroDying,
} from "./assets.js";
import { Sprite, subrenderSprite } from "./Sprite.js";
import {
  scaleAxes,
  shiftContent,
  subrender,
  rotateAboutY,
} from "../wattle/engine/src/swagl/MatrixStack.js";
import { Scene, ShadowRadius, fireBullet } from "./Scene.js";
import { MousePosition } from "./Game.js";
import { arctan, dirIsLeft } from "./utils.js";

const HERO_SPEED = 600;
const BULLET_SPEED = 640;
const JUMP_COOLDOWN = 0.25;
const SHOOT_COOLDOWN = 0.25;

const NOZZLE_X = 96;
const NOZZLE_Y = 50;
const ARM_LENGTH = Math.sqrt(NOZZLE_X * NOZZLE_X + NOZZLE_Y * NOZZLE_Y);

export const HERO_BULLET_HITS = ["HeroHit1", "HeroHit2", "HeroHit3"];

const HERO_DEATH = ["HeroDying1", "HeroDying2", "HeroDying3"];

export const BULLET_HEIGHT = 70;

const ARM_POS = {
  x: 0,
  y: BULLET_HEIGHT,
};

/**
 * All the states that the hero can be in
 * @typedef {Object} HeroState
 * @property {string} name - Useful for debugging
 * @property {function(Scene):void} processStep - Perform the hero's code
 * @property {?function():void} render - Render the hero
 * @property {?function():void} onExit
 */
let HeroState;

export class Hero {
  constructor(time) {
    /** @type {number} */
    this.x = 0;
    /** @type {number} */
    this.y = 0;
    /** @type {number} */
    this.z = 0;
    /** @type {number} */
    this.speed = 0;
    /** @type {number} */
    this.zSpeed = 0;
    /** @type {number} */
    this.damage = 0;
    /** @type {number} */
    this.showDamageUntil = 0;
    /** @type {number} */
    this.direction = 0;
    /** @type {number} */
    this.armDirection = 0;
    /** @type {Sprite} */
    this.head = makeHeroHead(time);
    /** @type {Sprite} */
    this.arm = makePistolArm(time);
    /** @type {Sprite} */
    this.bodyStatic = makeHeroBodyStatic(time);
    /** @type {Sprite} */
    this.bodyRunning = makeHeroRunning(time);
    /** @type {Sprite} */
    this.bodyRunningBackwards = makeHeroRunningBackwards(time);
    /** @type {boolean} */
    this.mirrorX = false;
    /** @type {ShadowRadius} */
    this.shadowRadius = { x: 30, y: 15 };
    /** @type {number} */
    this.jumpCooldown = 0;
    /** @type {number} */
    this.shootCooldown = 0;
    /** @type {boolean} */
    this.hidden = false;
    /** @type {HeroState} */
    this.state = {
      name: "unstarted",
      processStep: (scene) => this.changeState(scene, heroStateNormal, null),
      render: null,
      onExit: null,
    };
  }

  changeState(scene, stateBuilder, arg) {
    const oldStateOnExit = this.state.onExit;
    if (oldStateOnExit) oldStateOnExit();

    const state = stateBuilder(this, scene, arg);
    this.state = state;
    state.processStep(scene);
  }

  /**
   *
   * @param {Scene} scene
   * @param {function():boolean} processStep
   * @returns {function():boolean} A function that returns true when the step is over
   */
  changeToScriptedState(scene, processStep) {
    let finished = false;

    this.changeState(
      scene,
      () => ({
        name: "scripted",
        processStep: () => {
          if (processStep()) {
            finished = true;
            this.changeState(scene, heroStateNormal, null);
          }
        },
        render: null,
      }),
      null
    );

    return () => finished;
  }
}

function heroStateDying(hero, scene) {
  const sprite = makeHeroDying(scene.sceneTime);
  hero.showDamageUntil = -1;
  hero.speed = 0;
  hero.zSpeed = 0;

  scene.audio.playOneOf(hero, HERO_DEATH);

  let timeToReset = scene.sceneTime + 11;

  return {
    name: "dying",
    /** @param {Scene} scene */
    processStep: (scene) => {
      sprite.updateTime(scene.sceneTime);
      if (scene.sceneTime >= timeToReset) {
        scene.exiting = scene.sceneName;
      }
    },
    render: () => {
      sprite.prepareSpriteType();
      subrenderSprite(sprite);
    },
  };
}

function heroStateNormal(hero, scene) {
  return {
    name: "normal",
    /** @param {Scene} scene */
    processStep: (scene) => {
      if (hero.damage >= scene.heroTotalHealth) {
        hero.changeState(scene, heroStateDying, null);
        return;
      }

      const { input, sceneTime, stepSize } = scene;

      let dx = input.getSignOfAction("left", "right");
      let dy = input.getSignOfAction("down", "up");

      if (dx || dy) {
        hero.direction = arctan(dy, dx);
        hero.speed = HERO_SPEED;
      } else {
        hero.speed = 0;
      }

      if (sceneTime >= hero.jumpCooldown && input.isPressed("jump")) {
        hero.changeState(scene, heroStateJump, null);
        return;
      }

      const armDirection = hero.armDirection;
      hero.mirrorX = dirIsLeft(armDirection);

      if (scene.inFight && sceneTime >= hero.shootCooldown) {
        hero.shootCooldown = sceneTime + SHOOT_COOLDOWN;

        fireBullet(
          scene,
          hero.x,
          hero.y,
          ARM_POS.y,
          ARM_LENGTH,
          armDirection,
          BULLET_SPEED,
          true
        );
      }
    },
    render: null,
  };
}

function heroStateJump(hero, /** @type {Scene} */ scene) {
  const startTime = scene.sceneTime;
  const sprite = makeHeroJump(startTime);
  hero.direction = hero.armDirection;
  hero.mirrorX = dirIsLeft(hero.direction);
  hero.speed = HERO_SPEED / 2;

  scene.audio.playNamedSound(hero, "JumpSound");

  return {
    name: "jump",
    /** @param {Scene} scene */
    processStep: (scene) => {
      const sceneTime = scene.sceneTime;
      sprite.updateTime(sceneTime);

      // moves the shadow
      const p = (sceneTime - startTime) / 0.875;
      hero.zSpeed = BULLET_HEIGHT * (4 * (0.5 - p));

      if (sprite.isFinished()) {
        hero.changeState(scene, heroStateNormal, null);
      }
    },
    render: () => {
      sprite.prepareSpriteType();
      subrenderSprite(sprite);
    },
    onExit: () => {
      hero.z = 0;
      hero.zSpeed = 0;
      hero.jumpCooldown = scene.sceneTime + JUMP_COOLDOWN;
    },
  };
}

/**
 * @param {Scene} scene
 * @param {MousePosition} mousePosition
 */
export function processHero(scene, mousePosition) {
  const { hero, sceneTime, stepSize, sceneBox } = scene;

  hero.head.updateTime(sceneTime);
  hero.bodyStatic.updateTime(sceneTime);
  hero.bodyRunning.updateTime(sceneTime);
  hero.bodyRunningBackwards.updateTime(sceneTime);

  hero.armDirection = arctan(
    mousePosition.y - (hero.y + ARM_POS.y),
    mousePosition.x - (hero.x + ARM_POS.x)
  );

  hero.state.processStep(scene);

  const { speed, direction } = hero;
  let x = (hero.x += stepSize * speed * Math.cos(direction));
  let y = (hero.y += stepSize * speed * Math.sin(direction));
  hero.z += stepSize * hero.zSpeed;

  if (x < sceneBox.left) {
    hero.x = sceneBox.left;
  } else if (x > sceneBox.right) {
    hero.x = sceneBox.right;
  }

  if (y < sceneBox.bottom) {
    hero.y = sceneBox.bottom;
  } else if (y > sceneBox.top) {
    hero.y = sceneBox.top;
  }
}

/**
 *
 * @param {Hero} hero
 */
export function renderHero(hero) {
  if (hero.hidden) return;

  shiftContent(hero.x, hero.y, 0);

  const mirrorX = hero.mirrorX;
  if (mirrorX) scaleAxes(-1, 1, 1);

  const render = hero.state.render;
  if (render) {
    render();
    return;
  }

  // the default render

  const { head, arm } = hero;

  subrender(() => {
    shiftContent(ARM_POS.x, 0, ARM_POS.y);

    let angle = hero.armDirection;
    if (mirrorX) angle = Math.PI - angle;

    rotateAboutY(angle - 0.3);

    arm.prepareSpriteType();
    subrenderSprite(arm);
  });

  head.prepareSpriteType();
  subrenderSprite(head);

  let body;
  if (hero.speed) {
    if (hero.direction !== Math.PI / 2 && mirrorX ^ dirIsLeft(hero.direction)) {
      body = hero.bodyRunningBackwards;
    } else {
      body = hero.bodyRunning;
    }
  } else {
    body = hero.bodyStatic;
  }

  body.prepareSpriteType();
  subrenderSprite(body);
}
