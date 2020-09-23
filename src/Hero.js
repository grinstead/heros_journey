import {
  makeHeroHead,
  makePistolArm,
  makeHeroRunning,
  makeHeroBodyStatic,
  makeHeroRunningBackwards,
  makeHeroJump,
} from "./assets.js";
import { Sprite, subrenderSprite } from "./Sprite.js";
import {
  scaleAxes,
  shiftContent,
  subrender,
  rotateAboutY,
} from "../wattle/engine/src/swagl/MatrixStack.js";
import { Scene, ShadowRadius } from "./Scene.js";
import { MousePosition } from "./Game.js";
import { arctan } from "./utils.js";

const HERO_SPEED = 640;
const BULLET_SPEED = 400;
const BULLET_SHADOW = { x: 10, y: 5 };
const JUMP_COOLDOWN = 0.25;

const NOZZLE_X = 96;
const NOZZLE_Y = 50;
const ARM_LENGTH = Math.sqrt(NOZZLE_X * NOZZLE_X + NOZZLE_Y * NOZZLE_Y);

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
 * @property {function():void} render - Render the hero
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
    /** @type {HeroState} */
    this.state = {
      name: "unstarted",
      processStep: (scene) => this.changeState(scene, heroStateNormal, null),
      render: () => {},
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
}

function heroStateNormal(hero, scene) {
  return {
    name: "normal",
    /** @param {Scene} scene */
    processStep: (scene) => {
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
      }

      const armDirection = hero.armDirection;
      hero.mirrorX = dirIsLeft(armDirection);

      if (input.numPresses("shoot")) {
        const cos = Math.cos(armDirection);
        const sin = Math.sin(armDirection);

        scene.bullets.push({
          x: hero.x + ARM_LENGTH * cos,
          y: hero.y + ARM_LENGTH * sin,
          z: ARM_POS.y,
          dx: BULLET_SPEED * cos,
          dy: BULLET_SPEED * sin,
          shadowRadius: BULLET_SHADOW,
          isFriendly: true,
          startTime: 0,
          isDead: false,
        });
      }
    },
    render: () => {
      const { head, arm, mirrorX } = hero;

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
        if (
          hero.direction !== Math.PI / 2 &&
          mirrorX ^ dirIsLeft(hero.direction)
        ) {
          body = hero.bodyRunningBackwards;
        } else {
          body = hero.bodyRunning;
        }
      } else {
        body = hero.bodyStatic;
      }

      body.prepareSpriteType();
      subrenderSprite(body);
    },
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
      hero.z =
        BULLET_HEIGHT *
        Math.max(0, Math.sin((Math.PI * (sceneTime - startTime)) / 0.75));

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
      hero.jumpCooldown = scene.sceneTime + JUMP_COOLDOWN;
    },
  };
}

/**
 * @param {Scene} scene
 * @param {MousePosition} mousePosition
 */
export function processHero(scene, mousePosition) {
  const { hero, sceneTime, stepSize } = scene;

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
  hero.x += stepSize * speed * Math.cos(direction);
  hero.y += stepSize * speed * Math.sin(direction);
}

/**
 *
 * @param {Hero} hero
 */
export function renderHero(hero) {
  shiftContent(hero.x, hero.y, 0);

  const mirrorX = hero.mirrorX;
  if (mirrorX) scaleAxes(-1, 1, 1);

  hero.state.render();
}

function dirIsLeft(direction) {
  return 0.5 * Math.PI < direction && direction < 1.5 * Math.PI;
}
