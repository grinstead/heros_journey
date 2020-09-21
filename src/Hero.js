import { makeHeroHead, makePistolArm, makeHeroBodyStatic } from "./assets";
import { Sprite } from "./Sprite";

export class Hero {
  constructor(x, y, dx, dy, time) {
    /** @type {number} */
    this.x = x;
    /** @type {number} */
    this.y = y;
    /** @type {number} */
    this.dx = dx;
    /** @type {number} */
    this.dy = dy;
    /** @type {number} */
    this.armDirection = 0;
    /** @private {Sprite} */
    this._head = makeHeroHead(time);
    /** @private {Sprite} */
    this._arm = makePistolArm(time);
    /** @private {Sprite} */
    this._body = makeHeroBodyStatic(time);
  }
}
