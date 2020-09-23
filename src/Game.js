import { SceneKernel, Scene, ShadowRadius, Bullet } from "./Scene.js";
import {
  buildCleanable,
  onCleanUp,
  cleanUpObject,
} from "../wattle/engine/src/utils/raii.js";
import { TEST_DATA } from "./data.js";
import { WebGL } from "../wattle/engine/src/swagl/types.js";
import {
  loadAllSpriteTextures,
  subrenderSprite,
  setSpriteProgramAttrs,
  Sprite,
} from "./Sprite.js";
import { InputManager } from "../wattle/engine/src/InputManager.js";
import { World, initWorld, updateSceneTime, runSceneScript } from "./World.js";
import {
  Program,
  renderInProgram,
  makeAndLinkProgram,
} from "../wattle/engine/src/swagl/Program.js";
import {
  useMatrixStack,
  shiftContent,
  scaleAxes,
  applyMatrixOperation,
  subrenderEach,
  subrender,
  subrenderWithArg,
  afterSubrender,
} from "../wattle/engine/src/swagl/MatrixStack.js";
import {
  Mat4fv,
  SingleInt,
  Vec4Float,
} from "../wattle/engine/src/swagl/ProgramInput.js";
import { AudioManager } from "./AudioManager.js";
import { hexToBuffer } from "./hex.js";
import { loadUpGameScript } from "./GameScript.js";
import { renderHero, processHero, BULLET_HEIGHT } from "./Hero.js";
import { makeBulletBall } from "./assets.js";
import { magnitudeOf } from "./utils.js";

const FPS_SMOOTHING = 0.9;
const FULL_SPACE_ZOOM = 1 / 6;
const MAX_FRAME_TIME = 1 / 10;
const PIXELS_PER_UNIT = 0.5;
const BULLET_R = 10;
const DMG_COLOR = 0.4;

/** @typedef {{x:number, y:number}} MousePosition */
export let MousePosition;

// prettier-ignore
const MAP_Z_ONTO_Y = new Float32Array([
  1, 0, 0, 0,
  0, 1, 1, 0,
  0, 1, 0, 0,
  0, 0, 0, 1,
]);

/**
 * @typedef {Object} CircleBuffer
 * @property {WebGLBuffer} buffer
 * @property {number} numPoints
 */
let CircleBuffer;

/**
 * @typedef {Object} WhiteboardObject
 * @property {WebGLBuffer} vertexBuffer
 * @property {WebGLBuffer} indexBuffer
 * @property {number} numPoints
 */
export let WhiteboardObject;

export class Game {
  constructor(args) {
    /** @type {!World} */
    this.world = args.world;
    /** @type {!Program<{projection:!Mat4fv,color:!Vec4Float}>} */
    this.svgProgram = args.svgProgram;
    /** @type {!Program<{projection:!Mat4fv,texture:!SingleInt,minColor:!Vec4Float}>} */
    this.rasterProgram = args.rasterProgram;
    /** @type {{w: number, h: number}} */
    this.display = { w: args.widthPx, h: args.heightPx };
    /** @type {!Array<number>} [r, g, b] */
    this.backgroundColor = args.backgroundColor;
    /** @type {!Array<!WhiteboardObject>} */
    this.whiteboardObjects = args.whiteboardObjects;
    /** @private {number} 0 if not running */
    this.runningTimerId = 0;
    /** @type {number} the average fps */
    this.fps = 0;
    /** @type {CircleBuffer} */
    this.circleShadow = args.circleShadow;
    /** @type {MousePosition} */
    this.onScreenMousePosition = args.mousePosition;
    /** @type {Sprite} */
    this.bulletSprite = makeBulletBall(0);
  }

  performStep() {
    const realTime = Date.now() / 1000;
    const world = this.world;
    const scene = world.activeScene;

    let sceneTime = updateSceneTime(scene, realTime, MAX_FRAME_TIME);
    let stepSize = scene.stepSize;

    const hero = scene.hero;

    {
      const targetCamera = world.targetCamera;
      const heroX = hero.x;
      const heroY = hero.y + BULLET_HEIGHT;
      const altTarget = scene.cameraTarget;

      if (altTarget) {
        targetCamera.x = (heroX + altTarget.x) / 2;
        targetCamera.y = (heroY + altTarget.y + BULLET_HEIGHT) / 2;
      } else {
        targetCamera.x = heroX;
        targetCamera.y = heroY;
      }
    }

    world.adjustCamera(scene);

    const camera = world.camera;

    const actualZoom = cameraZoomToActualZoom(camera.zoom);

    const { onScreenMousePosition, display } = this;
    const mousePosition = {
      x:
        (onScreenMousePosition.x - display.w / 2) /
          PIXELS_PER_UNIT /
          actualZoom +
        camera.x,
      y:
        -(onScreenMousePosition.y - display.h / 2) /
          PIXELS_PER_UNIT /
          actualZoom +
        camera.y,
    };

    let numDeadBullets = 0;
    let bullets = scene.bullets;
    bullets.forEach((bullet) => {
      if (bullet.isDead) {
        numDeadBullets++;
        return;
      }

      bullet.x += stepSize * bullet.dx;
      bullet.y += stepSize * bullet.dy;

      // TODO: kill off bullets
    });

    if (numDeadBullets > 100) {
      bullets = bullets.filter((b) => !b.isDead);
      scene.bullets = bullets;
    }

    // sort so that they can be used for collisions
    bullets.sort(compareBulletsByX);

    processHero(scene, mousePosition);

    scene.objects.forEach((object) => {
      object.sprite.updateTime(sceneTime);

      const speed = object.speed;
      if (speed) {
        const direction = object.direction;
        object.x += speed * Math.cos(direction) * stepSize;
        object.y += speed * Math.sin(direction) * stepSize;
      }

      const zSpeed = object.zSpeed;
      if (zSpeed) {
        object.z += zSpeed * stepSize;
      }

      const { x, y, z, shadowRadius } = object;
      const minTestX = x - shadowRadius.x - BULLET_R;
      const maxTestX = x + shadowRadius.x + BULLET_R;

      let i = 0;
      const numBullets = bullets.length;
      while (i < numBullets && bullets[i].x < minTestX) {
        i++;
      }

      while (i < numBullets && bullets[i].x < maxTestX) {
        const bullet = bullets[i++];
        if (
          !bullet.isDead &&
          bullet.isFriendly &&
          bullet.z >= z && // checking the enemy is not off the ground
          distanceFromEllipseSortOf(x, y, shadowRadius, bullet) < BULLET_R
        ) {
          bullet.isDead = true;
          object.showDamageUntil = sceneTime + 0.125;
          // TODO: register hit
        }
      }
    });

    runSceneScript(scene);

    renderGame(this);
  }

  startRunning() {
    if (this.runningTimerId !== 0) return;

    let timerId = 0;
    let lastTimeMs = null;

    const onFrame = () => {
      if (this.runningTimerId !== timerId) return;

      const now = Date.now();
      if (lastTimeMs == null) {
        this.fps = 60;
      } else {
        const diff = now - lastTimeMs;
        this.fps =
          FPS_SMOOTHING * this.fps + (1 - FPS_SMOOTHING) * (1000 / diff);
      }
      lastTimeMs = now;

      // run code (this could technically stop the game)
      this.performStep();

      if (this.runningTimerId !== timerId) return;
      this.runningTimerId = timerId = requestAnimationFrame(onFrame);
    };

    this.runningTimerId = timerId = requestAnimationFrame(onFrame);
  }

  stopRunning() {
    this.runningTimerId = 0;
  }

  isRunning() {
    return this.runningTimerId !== 0;
  }
}

/**
 *
 * @param {Game} game
 */
function renderGame(game) {
  const world = game.world;
  const scene = world.activeScene;

  const camera = world.camera;

  const zoom = cameraZoomToActualZoom(camera.zoom);

  const adjustToDisplayCoordinates = () => {
    const dims = game.display;
    scaleAxes(
      (2 / dims.w) * PIXELS_PER_UNIT,
      (2 / dims.h) * PIXELS_PER_UNIT,
      FULL_SPACE_ZOOM / dims.h
    );
  };

  const svgProgram = game.svgProgram;
  renderInProgram(svgProgram, (gl) => {
    const position = svgProgram.attr("a_position");
    gl.enableVertexAttribArray(position);

    useMatrixStack(svgProgram.inputs.projection);

    const bg = game.backgroundColor;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    scaleAxes(zoom, zoom, 1);

    shiftContent(0, 0, 1);
    adjustToDisplayCoordinates();

    shiftContent(-camera.x, -camera.y, 0);

    subrender(() => {
      svgProgram.inputs.color.set(0.7, 0.7, 0.9, 1);

      // move according to the center of the current screen
      const sceneBox = scene.sceneBox;
      shiftContent(-sceneBox.originX, -sceneBox.originY, 0);

      // switch image to the world space
      scaleAxes(2 / FULL_SPACE_ZOOM, -2 / FULL_SPACE_ZOOM, 1);

      // shift the image to the center (in its native resolution)
      // note that the image is upside-down at this point
      shiftContent(-(960 / 2), -640 / 2, 0);

      game.whiteboardObjects.forEach((obj) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, obj.vertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, obj.indexBuffer);
        gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);

        gl.drawElements(gl.TRIANGLES, obj.numPoints, gl.UNSIGNED_SHORT, 0);
      });
    });

    // render all the shadows
    subrender(() => {
      svgProgram.inputs.color.set(0, 0, 0, 0.1);

      const circleShadow = game.circleShadow;
      gl.bindBuffer(gl.ARRAY_BUFFER, circleShadow.buffer);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);

      /**
       * @param {Object} data
       * @param {number} data.x
       * @param {number} data.y
       * @param {number} data.z
       * @param {{x:number,y:number}} data.shadowRadius
       */
      const renderShadow = ({ x, y, z, shadowRadius }) => {
        shiftContent(x, y - z, 0);
        scaleAxes(shadowRadius.x, shadowRadius.y, 1);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, circleShadow.numPoints);
      };

      subrenderWithArg(renderShadow, scene.hero);
      subrenderEach(scene.objects, renderShadow);

      subrenderEach(scene.bullets, ({ x, y, shadowRadius, isDead }) => {
        if (isDead) return;

        shiftContent(x, y, 0);
        scaleAxes(shadowRadius.x, shadowRadius.y, 1);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, circleShadow.numPoints);
      });
    });
  });

  const rasterProgram = game.rasterProgram;
  renderInProgram(rasterProgram, (gl) => {
    gl.activeTexture(gl.TEXTURE0);
    rasterProgram.inputs.texture.set(0);

    const position = rasterProgram.attr("a_position");
    gl.enableVertexAttribArray(position);
    const texturePosition = rasterProgram.attr("a_texturePosition");
    gl.enableVertexAttribArray(texturePosition);
    setSpriteProgramAttrs(position, texturePosition);

    useMatrixStack(rasterProgram.inputs.projection);

    rasterProgram.inputs.minColor.set(0, 0, 0, 0);

    scaleAxes(zoom, zoom, 1);
    adjustToDisplayCoordinates();
    applyMatrixOperation(MAP_Z_ONTO_Y);

    shiftContent(-camera.x, -camera.y, 0);

    const sceneTime = scene.sceneTime;
    subrenderEach(scene.objects, (object) => {
      if (sceneTime < object.showDamageUntil) {
        showDamage(rasterProgram);
      }
      shiftContent(object.x, object.y, object.z);
      const sprite = object.sprite;
      sprite.prepareSpriteType();
      subrenderSprite(sprite);
    });

    const bulletSprite = game.bulletSprite;
    bulletSprite.prepareSpriteType();
    subrenderEach(scene.bullets, (bullet) => {
      if (bullet.isDead) return;
      shiftContent(bullet.x, bullet.y, bullet.z);
      subrenderSprite(bulletSprite);
    });

    subrenderWithArg(renderHero, scene.hero);
  });
}

/**
 * @param {Object} args
 * @param {!HTMLCanvasElement} args.canvas - The canvas to draw on
 * @param {!InputManager} args.input
 * @param {MousePosition} args.mousePosition
 * @returns {!Promise<!Game>}
 */
export async function makeGame({ canvas, input, mousePosition }) {
  const computedStyle = getComputedStyle(canvas);
  const widthPx = parseInt(computedStyle.getPropertyValue("width"), 10);
  const heightPx = parseInt(computedStyle.getPropertyValue("height"), 10);

  const baseBackgroundColor = /rgb\((\d+), (\d+), (\d+)\)/.exec(
    computedStyle.getPropertyValue("background-color")
  );

  const backgroundColor = [
    baseBackgroundColor[1] / 255, // implicit conversion
    baseBackgroundColor[2] / 255, // implicit conversion
    baseBackgroundColor[3] / 255, // implicit conversion
  ];

  const ratio = window.devicePixelRatio || 1;
  canvas.width = ratio * widthPx;
  canvas.height = ratio * heightPx;

  const audio = new AudioManager();

  const [finishLoadingSprites, gameScript] = await Promise.all([
    loadAllSpriteTextures(),
    loadUpGameScript(500 / FULL_SPACE_ZOOM),
    audio.loadAllSounds(),
  ]);

  return buildCleanable(() => {
    /**
     * Not sure why, but closure is crapping up here
     * @suppress {checkTypes}
     * @type {!WebGL}
     */
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
    });

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    finishLoadingSprites(gl);

    const svgProgram = makeAndLinkProgram({
      name: "svg",
      gl,
      inputs: {
        projection: new Mat4fv("u_projection"),
        color: new Vec4Float("u_color"),
      },
      shaders: {
        vertex: {
          name: "vertex",
          code: `#version 300 es
in vec3 a_position;
uniform mat4 u_projection;

void main() {
  gl_Position = u_projection * vec4(a_position, 1);
}`,
        },
        fragment: {
          name: "fragment",
          code: `#version 300 es
precision highp float;

uniform vec4 u_color;

out vec4 output_color;

void main() {
  output_color = u_color;
}`,
        },
      },
    });
    onCleanUp(() => void cleanUpObject(svgProgram));

    const rasterProgram = makeAndLinkProgram({
      name: "raster",
      gl,
      inputs: {
        projection: new Mat4fv("u_projection"),
        texture: new SingleInt("u_texture"),
        minColor: new Vec4Float("u_min_color"),
      },
      shaders: {
        vertex: {
          name: "vertex",
          code: `#version 300 es
in vec3 a_position;
in vec2 a_texturePosition;

uniform mat4 u_projection;

out vec4 v_clipSpace;
out vec2 v_texturePosition;

void main() {
gl_Position = u_projection * vec4(a_position, 1);
v_texturePosition = a_texturePosition;
}`,
        },
        fragment: {
          name: "fragment",
          code: `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec4 u_min_color;

in vec2 v_texturePosition;
out vec4 output_color;

void main() {
vec4 color = texture(u_texture, v_texturePosition.st);
if (color.a == 0.0) {
    discard;
}

output_color = max(color, u_min_color);
}`,
        },
      },
    });
    onCleanUp(() => void cleanUpObject(rasterProgram));

    const whiteboardObjects = TEST_DATA.map(({ positions, cells }) => {
      const posData = new Float32Array(hexToBuffer(positions));
      const cellData = new Uint16Array(hexToBuffer(cells));

      const vertexBuffer = gl.createBuffer();
      onCleanUp(() => void gl.deleteBuffer(vertexBuffer));

      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, posData, gl.STATIC_DRAW);

      const indexBuffer = gl.createBuffer();
      onCleanUp(() => void gl.deleteBuffer(indexBuffer));

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cellData, gl.STATIC_DRAW);

      return {
        vertexBuffer,
        indexBuffer,
        numPoints: cellData.length,
      };
    });

    input.setKeysForAction("up", ["w", "ArrowUp"]);
    input.setKeysForAction("down", ["s", "ArrowDown"]);
    input.setKeysForAction("left", ["a", "ArrowLeft"]);
    input.setKeysForAction("right", ["d", "ArrowRight"]);
    input.setKeysForAction("shoot", ["f", "h"]);
    input.setKeysForAction("jump", ["z", "x", " "]);

    const world = initWorld({ input, audio, gameScript });

    const circleShadow = makeCircle(gl);
    onCleanUp(() => void gl.deleteBuffer(circleShadow.buffer));

    return new Game({
      world,
      widthPx,
      heightPx,
      svgProgram,
      rasterProgram,
      backgroundColor,
      whiteboardObjects,
      circleShadow,
      mousePosition,
    });
  });
}

/**
 * Creates a circle in the x-y plain centered on the origin with radius 1
 * @param {WebGL} gl
 * @returns {CircleBuffer}
 */
function makeCircle(gl) {
  const numEdges = 20;

  const wedgeAngle = (2 * Math.PI) / numEdges;

  const points = [0, 0, 0];
  for (let i = 0; i <= numEdges; i++) {
    const angle = i * wedgeAngle;
    points.push(Math.cos(angle), Math.sin(angle), 0);
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);

  return {
    buffer,
    numPoints: points.length / 3,
  };
}

/**
 * Comparator
 * @param {Bullet} a
 * @param {Bullet} b
 */
function compareBulletsByX(a, b) {
  return a.x - b.x;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {ShadowRadius} shadowRadius
 * @param {Bullet} bullet
 */
function distanceFromEllipseSortOf(x, y, shadowRadius, bullet) {
  const { x: rx, y: ry } = shadowRadius;

  // the distance of the foci from the center
  const f = Math.sqrt(Math.abs(rx * rx - ry * ry));

  if (rx >= ry) {
    return (
      magnitudeOf(bullet.x - (x - f), bullet.y - y, 0) +
      magnitudeOf(bullet.x - (x + f), bullet.y - y, 0) -
      2 * rx
    );
  } else {
    return (
      magnitudeOf(bullet.x - x, bullet.y - (y - f), 0) +
      magnitudeOf(bullet.x - x, bullet.y - (y + f), 0) -
      2 * ry
    );
  }
}

function cameraZoomToActualZoom(zoom) {
  return FULL_SPACE_ZOOM * (1 - zoom) + zoom;
}

function showDamage(rasterProgram) {
  const minColor = rasterProgram.inputs.minColor;

  minColor.set(DMG_COLOR, DMG_COLOR, DMG_COLOR, 0);
  afterSubrender(() => {
    minColor.set(0, 0, 0, 0);
  });
}
