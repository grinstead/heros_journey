import {
  Texture,
  loadTextureFromImgUrl,
} from "../wattle/engine/src/swagl/Texture.js";
import { WebGL } from "../wattle/engine/src/swagl/types.js";
import {
  subrenderEach,
  applyMatrixOperation,
  scaleAxes,
  subrenderWithArg,
} from "../wattle/engine/src/swagl/MatrixStack.js";

/**
 * The options you can pass to a Sprite object on creation
 * @typedef {Object}
 * @property {string} name - The name of this Sprite (for debugging)
 * @property {string} src - The src url for the texture
 * @property {Array<number>} bufferData - Assumed to be an array of [...[x, y, z, texX, texY]]
 * @property {boolean|number} loops - The number of times a sprite loops, false (or 0) if it does not, and true if it loops forever
 * @property {Array<number> | number} frameTime - The time (in seconds) a frame (or each frame) should stay on screen
 * @property {?Array<*>} perFrameData - If you have meta-data for each frame, you can supply it and query it directly from the Sprite's frameData() method
 * @property {?Array<number>} transform - A transform to run when rendering the sprite
 * @property {!Array<!Array<{i: number, m: ?Float32Array}>>} frameElements - The elements that need to be drawn
 */
let SpriteDefinition;

/**
 * A Sprite is an atomic render-able. Unlike normal sprite systems, a sprite in
 * this system has 3d coordinates, but reads from only one texture. It can also
 * have multiple ways of rendering (eg. facing different
 * directions). In many ways, I probably should have just called it a "model".
 *
 * All the "modes" must have the same number of frames.
 */
export class Sprite {
  /**
   * Constructs a Sprite. Do not call this directly, use makeSpriteType instead
   * @private
   * @param {SpriteDefinition} options
   * @param {Array<number>} frameTimes - Computed once, supersedes the value in options
   * @param {number} time - The scene time
   * @param {Texture} tex - The texture
   * @param {WebGLBuffer} buffer - The buffer containing all the vertex data
   */
  constructor(options, frameTimes, time, tex, buffer) {
    const { loops, transform } = options;

    // set the name immediately so that the possible errors print nicely
    /** @private {string} _name - The name of this Sprite, for debugging */
    this._name = options.name;
    /** @private {number} When the sprite started */
    this._startTime = time;
    /** @private {number} The number of time a sprite loops (-1 if it loops forever) */
    this._targetLoops = typeof loops === "number" ? loops : loops ? -1 : 0;
    /** @private {Array<number>} The amount of time (in seconds) each frame stays on screen */
    this._frameTimes = frameTimes;
    /** @private {number} The number of times the sprite has looped since being reset */
    this._currentLoop = 0;
    /** @private {number} The index of the active frame, or -1 if the Sprite is not active */
    this._frameIndex = 0;
    /** @private {number} The time when we should switch frames, or -1 if we reached the last one */
    this._nextFrameTime = time + frameTimes[0];
    /** @private {?Array<*>} Extra data for each frame */
    this._frameData = options.perFrameData;
    /** @type {Texture} The sprite's texture */
    this.texture = tex;
    /** @private {!Array<!Array<{i: number, m: !Float32Array}>>} Each element that needs to be rendered */
    this._frameElements = options.frameElements;
    /** @private {WebGLBuffer} */
    this._buffer = buffer;
    /** @private {?Float32Array} */
    this._transform = transform ? new Float32Array(transform) : null;
  }

  /**
   * Updates the time, which updates the frame position
   * @param {number} time - The room time
   * @returns {boolean} true if the frame changed (also returns true if the animation completes)
   */
  updateTime(time) {
    let changed = false;

    // check if we should advance the frame
    let nextFrameTime = this._nextFrameTime;
    while (nextFrameTime !== -1 && nextFrameTime <= time) {
      changed = true;

      const frameTimes = this._frameTimes;
      const nextFrame = this._frameIndex + 1;
      if (nextFrame === frameTimes.length) {
        // check if we are in the last loop. This frame cleverly handles targetLoops === -1 (the infinite case)
        if (this._currentLoop === this._targetLoops) {
          // stay on this frame, but adjust the time to never advance
          this._nextFrameTime = nextFrameTime = -1;
        } else {
          this._currentLoop++;
          this._frameIndex = 0;
          this._nextFrameTime = nextFrameTime = time + frameTimes[0];
        }
      } else {
        this._frameIndex = nextFrame;
        this._nextFrameTime = nextFrameTime = time + frameTimes[nextFrame];
      }
    }

    return changed;
  }

  /**
   * Returns the index of the current frame
   * @returns {number} the frame index
   */
  frameIndex() {
    return this._frameIndex;
  }

  /**
   * Get the data for the sprite's current frame, as defined by the perFrameData
   * option. If perFrameData was not supplied, then this returns undefined
   * @returns {*} the data for that frame
   */
  frameData() {
    const frameData = this._frameData;
    return frameData != null ? frameData[this._frameIndex] : undefined;
  }

  /**
   * Returns whether the sprite has finished. Sprites that infinitely loop do not complete.
   * @return {boolean} Whether the sprite has finished
   */
  isFinished() {
    return this._nextFrameTime === -1;
  }

  /**
   * Resets the sprite back to the original index.
   * @param {number} time - The room time
   */
  resetSprite(time) {
    this._currentLoop = 0;
    this._startTime = time;
    this._frameIndex = 0;
    this._nextFrameTime = time + this._frameTimes[0];
  }

  /**
   * @param {number} vertexBufferPos
   * @param {number} textureBufferPos
   */
  bindSpriteType(vertexBufferPos, textureBufferPos) {
    const tex = this.texture;
    const gl = tex.gl;

    tex.bindTexture();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._buffer);
    gl.vertexAttribPointer(vertexBufferPos, 3, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(textureBufferPos, 2, gl.FLOAT, false, 20, 12);
  }

  /**
   * Returns the name, primarily for debugging
   * @returns {string} The name (given in the options earlier)
   */
  name() {
    return this._name;
  }

  toString() {
    return `Sprite/${this._name}`;
  }
}

/**
 * Creates a new sprite, starts "animating" immediately (it keeps track of
 * time). The first argument is the sprite's starting mode, the second is the
 * current time.
 * @typedef {function(number):Sprite} SpriteBuilder
 */
export let SpriteBuilder;

/** @type {!Map<number, string|Texture>} */
const spriteIdToTexture = new Map();

let nextSpriteId = 1;

/**
 * @param {SpriteDefinition} def
 * @returns {SpriteBuilder}
 */
export function defineSprite(def) {
  const spriteId = nextSpriteId++;

  spriteIdToTexture.set(spriteId, def.src);

  let tex = null;
  let buffer = null;

  const numFrames = def.frameElements.length;
  const frameTime = def.frameTime;
  const frameTimes =
    typeof frameTime === "number"
      ? new Array(numFrames).fill(frameTime)
      : frameTime;

  function makeSprite(sceneTime) {
    if (tex == null) {
      tex = spriteIdToTexture.get(spriteId);
      if (!tex || typeof tex === "string") {
        throw new Error("Tried to makeSprite before texture loaded");
      }
    }

    if (buffer == null) {
      const gl = tex.gl;
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(def.bufferData),
        gl.STATIC_DRAW
      );
    }

    return new Sprite(def, frameTimes, sceneTime, tex, buffer);
  }

  return makeSprite;
}

/**
 * Loads all the declared sprite's textures
 * @param {!WebGL} gl
 */
export function loadAllSpriteTextures(gl) {
  const promises = [];

  spriteIdToTexture.forEach((texture, spriteId) => {
    if (typeof texture !== "string") return;

    promises.push(
      loadTextureFromImgUrl({
        src: texture,
        name: texture,
        gl,
      }).then((actualTexture) => {
        spriteIdToTexture.set(spriteId, actualTexture);
      })
    );
  });

  return Promise.all(promises);
}

export function subrenderSprite(sprite) {
  subrenderWithArg(renderSprite, sprite);
}

function renderSprite(sprite) {
  const transform = sprite._transform;
  if (transform) applyMatrixOperation(transform);

  const index = sprite._frameIndex;
  subrenderEach(sprite._frameElements[index], ({ i, m }, gl) => {
    if (m) applyMatrixOperation(m);
    gl.drawArrays(gl.TRIANGLE_STRIP, i, 4);
  });
}
