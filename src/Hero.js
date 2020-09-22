import { makeHeroHead, makePistolArm, makeHeroBodyStatic } from "./assets.js";
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
    this.dx = 0;
    /** @type {number} */
    this.dy = 0;
    /** @type {number} */
    this.armDirection = 0;
    /** @type {Sprite} */
    this.head = makeHeroHead(time);
    /** @type {Sprite} */
    this.arm = makePistolArm(time);
    /** @type {Sprite} */
    this.body = makeHeroBodyStatic(time);
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
  const { input, hero, stepSize } = scene;

  let dx = HERO_SPEED * input.getSignOfAction("left", "right");
  let dy = HERO_SPEED * input.getSignOfAction("down", "up");
  if (dy && dx) {
    dx *= SQRT2_INV;
    dy *= SQRT2_INV;
  }

  hero.dx = dx;
  hero.dy = dy;
  hero.x += dx * stepSize;
  hero.y += dy * stepSize;

  const xAimDiff = mousePosition.x - (hero.x + ARM_POS.x);
  hero.armDirection = arctan(mousePosition.y - (hero.y + ARM_POS.y), xAimDiff);

  if (xAimDiff !== 0) hero.mirrorX = xAimDiff < 0;
}

/**
 *
 * @param {Hero} hero
 */
export function renderHero(hero) {
  shiftContent(hero.x, hero.y, 0);

  const mirrorX = hero.mirrorX;
  if (mirrorX) scaleAxes(-1, 1, 1);

  const { head, arm, body } = hero;

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

  body.prepareSpriteType();
  subrenderSprite(body);
}
