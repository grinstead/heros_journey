import {
  makeHeroHead,
  makePistolArm,
  makeHeroRunning,
  makeHeroBodyStatic,
  makeHeroRunningBackwards,
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

const SQRT2_INV = 0.7071;
const HERO_SPEED = 640;
const BULLET_SPEED = 400;
const BULLET_SHADOW = { x: 10, y: 5 };

const NOZZLE_X = 96;
const NOZZLE_Y = 50;
const ARM_LENGTH = Math.sqrt(NOZZLE_X * NOZZLE_X + NOZZLE_Y * NOZZLE_Y);

const ARM_POS = {
  x: 0,
  y: 70,
};

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
    this.bodyRunningBack = makeHeroRunningBackwards(time);
    /** @type {boolean} */
    this.mirrorX = false;
    /** @type {ShadowRadius} */
    this.shadowRadius = { x: 30, y: 15 };
  }
}

/**
 *
 * @param {Scene} scene
 * @param {MousePosition} mousePosition
 */
export function processHero(scene, mousePosition) {
  const { input, hero, stepSize, sceneTime } = scene;

  hero.head.updateTime(sceneTime);
  hero.bodyStatic.updateTime(sceneTime);
  hero.bodyRunning.updateTime(sceneTime);
  hero.bodyRunningBack.updateTime(sceneTime);

  let dx = input.getSignOfAction("left", "right");
  let dy = input.getSignOfAction("down", "up");

  let x = hero.x;
  let y = hero.y;

  if (dx || dy) {
    const direction = arctan(dy, dx);
    const speed = HERO_SPEED;

    hero.direction = direction;
    hero.speed = HERO_SPEED;

    hero.x = x += stepSize * speed * Math.cos(direction);
    hero.y = y += stepSize * speed * Math.sin(direction);
  } else {
    hero.speed = 0;
  }

  const xAimDiff = mousePosition.x - (x + ARM_POS.x);
  const armDirection = arctan(mousePosition.y - (y + ARM_POS.y), xAimDiff);
  hero.armDirection = armDirection;

  if (xAimDiff !== 0) hero.mirrorX = xAimDiff < 0;

  if (input.numPresses("shoot")) {
    const cos = Math.cos(armDirection);
    const sin = Math.sin(armDirection);

    scene.bullets.push({
      x: x + ARM_LENGTH * cos,
      y: y + ARM_LENGTH * sin,
      z: ARM_POS.y,
      dx: BULLET_SPEED * cos,
      dy: BULLET_SPEED * sin,
      shadowRadius: BULLET_SHADOW,
      isFriendly: true,
      startTime: 0,
      isDead: false,
    });
  }
}

/**
 *
 * @param {Hero} hero
 */
export function renderHero(hero) {
  shiftContent(hero.x, hero.y, 0);

  const mirrorX = hero.mirrorX;
  if (mirrorX) scaleAxes(-1, 1, 1);

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
    if (mirrorX ^ (Math.abs(hero.direction - Math.PI) < Math.PI / 2)) {
      body = hero.bodyRunningBack;
    } else {
      body = hero.bodyRunning;
    }
  } else {
    body = hero.bodyStatic;
  }

  body.prepareSpriteType();
  subrenderSprite(body);
}
