import { SceneKernel, Scene } from "./Scene.js";
import {
  buildCleanable,
  onCleanUp,
  cleanUpObject,
} from "../wattle/engine/src/utils/raii.js";
import { TEST_DATA } from "./data.js";
import { WebGL } from "../wattle/engine/src/swagl/types.js";
import { loadAllSpriteTextures, subrenderSprite } from "./Sprite.js";
import { InputManager } from "../wattle/engine/src/InputManager.js";
import { World, initWorld, updateSceneTime } from "./World.js";
import {
  Program,
  renderInProgram,
  makeAndLinkProgram,
} from "../wattle/engine/src/swagl/Program.js";
import {
  useMatrixStack,
  shiftContent,
  scaleAxes,
} from "../wattle/engine/src/swagl/MatrixStack.js";
import { Mat4fv, SingleInt } from "../wattle/engine/src/swagl/ProgramInput.js";
import { AudioManager } from "./AudioManager.js";
import { hexToBuffer } from "./hex.js";
import { makeHeroHead } from "./assets.js";

const FPS_SMOOTHING = 0.9;

/**
 * @typedef {Object} WhiteboardObject
 * @property {WebGLBuffer} vertexBuffer
 * @property {WebGLBuffer} indexBuffer
 * @property {number} numPoints
 */
export let WhiteboardObject;

/**
 * @typedef {Object} Camera
 * @property {{x: number, y: number}} focus
 * @property {number} zoom
 */
export let Camera;

export class Game {
  constructor(args) {
    /** @type {!World} */
    this.world = args.world;
    /** @type {!Program<{projection:!Mat4fv}>} */
    this.svgProgram = args.svgProgram;
    /** @type {!Program<{projection:!Mat4fv,texture:!SingleInt}>} */
    this.rasterProgram = args.rasterProgram;
    /** @type {!Camera} */
    this.camera = { focus: { x: 0, y: 0 }, zoom: 1 };
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
  }

  loadAssets() {
    return loadAllSpriteTextures(this.svgProgram.gl);
  }

  performStep() {
    const realTime = Date.now() / 1000;
    const scene = this.world.activeScene;
    updateSceneTime(scene, realTime);

    renderGame(this, scene);
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
 * @param {Scene} scene
 */
function renderGame(game, scene) {
  const camera = game.camera;
  const scaleAxesToDisplay = () => {
    const dims = game.display;
    scaleAxes(2 / dims.w, 2 / dims.h, 1);
  };

  const svgProgram = game.svgProgram;
  renderInProgram(svgProgram, (gl) => {
    useMatrixStack(svgProgram.inputs.projection);

    const bg = game.backgroundColor;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    scaleAxes(camera.zoom, camera.zoom, 0);
    shiftContent(-1, 1, 0);
    scaleAxesToDisplay();

    shiftContent(-camera.focus.x, -camera.focus.y, 0);

    const position = svgProgram.attr("a_position");
    gl.enableVertexAttribArray(position);

    scaleAxes(1, -1, 1);
    game.whiteboardObjects.forEach((obj) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, obj.vertexBuffer);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, obj.indexBuffer);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);

      gl.drawElements(gl.TRIANGLES, obj.numPoints, gl.UNSIGNED_SHORT, 0);
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

    useMatrixStack(rasterProgram.inputs.projection);

    scaleAxesToDisplay();

    const head = makeHeroHead(0);
    head.bindSpriteType(position, texturePosition);
    subrenderSprite(head);
  });
}

/**
 * @param {Object} args
 * @param {!HTMLCanvasElement} args.canvas - The canvas to draw on
 * @param {!InputManager} args.input
 * @returns {!Game}
 */
export function makeGame({ canvas, input }) {
  return buildCleanable(() => {
    /**
     * Not sure why, but closure is crapping up here
     * @suppress {checkTypes}
     * @type {!WebGL}
     */
    const computedStyle = getComputedStyle(canvas);

    const baseBackgroundColor = /rgb\((\d+), (\d+), (\d+)\)/.exec(
      computedStyle.getPropertyValue("background-color")
    );

    const backgroundColor = [
      baseBackgroundColor[1] / 255, // implicit conversion
      baseBackgroundColor[2] / 255, // implicit conversion
      baseBackgroundColor[3] / 255, // implicit conversion
    ];

    const widthPx = parseInt(computedStyle.getPropertyValue("width"), 10);
    const heightPx = parseInt(computedStyle.getPropertyValue("height"), 10);

    const ratio = window.devicePixelRatio || 1;
    canvas.width = ratio * widthPx;
    canvas.height = ratio * heightPx;

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
    });

    gl.enable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    /** @type {!Program<{projection:!Mat4fv}>} */
    const svgProgram = makeAndLinkProgram({
      name: "svg",
      gl,
      inputs: {
        projection: new Mat4fv("u_projection"),
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

out vec4 output_color;

void main() {
  output_color = vec4(0.9f, 0.9f, 0.9f, 1.0f);
}`,
        },
      },
    });
    onCleanUp(() => void cleanUpObject(svgProgram));

    /** @type {!Program<{projection:!Mat4fv,texture:!SingleInt}>} */
    const rasterProgram = makeAndLinkProgram({
      name: "raster",
      gl,
      inputs: {
        projection: new Mat4fv("u_projection"),
        texture: new SingleInt("u_texture"),
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

in vec2 v_texturePosition;
out vec4 output_color;

void main() {
vec4 color = texture(u_texture, v_texturePosition.st);
if (color.a == 0.0) {
    discard;
}

output_color = color;
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
    input.setKeysForAction("shoot", ["h", " "]);

    const world = initWorld({ input, audio: new AudioManager() });

    return new Game({
      world,
      widthPx,
      heightPx,
      svgProgram,
      rasterProgram,
      backgroundColor,
      whiteboardObjects,
    });
  });
}
