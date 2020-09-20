import {
  Program,
  makeAndLinkProgram,
  renderInProgram,
} from "../wattle/engine/src/swagl/Program.js";
import { Mat4fv, SingleInt } from "../wattle/engine/src/swagl/ProgramInput.js";
import { TEST_DATA } from "./data.js";
import { hexToBuffer } from "./hex.js";
import { InputManager } from "../wattle/engine/src/InputManager.js";
import {
  loadTextureFromImgUrl,
  Texture,
} from "../wattle/engine/src/swagl/Texture.js";
import {
  useMatrixStack,
  applyMatrixOperation,
  scaleAxes,
  shiftContent,
  subrender,
  rotateAboutZ,
} from "../wattle/engine/src/swagl/MatrixStack.js";

async function onLoad() {
  const input = new InputManager(document.body);
  input.setKeysForAction("up", ["w", "ArrowUp"]);
  input.setKeysForAction("down", ["s", "ArrowDown"]);
  input.setKeysForAction("left", ["a", "ArrowLeft"]);
  input.setKeysForAction("right", ["d", "ArrowRight"]);

  const maybeCanvas = document.getElementById("canvas");
  /** @type {HTMLCanvasElement} */
  const canvas = maybeCanvas instanceof HTMLCanvasElement ? maybeCanvas : null;

  const fpsNode = document.getElementById("fps");

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

  let mouseX = 0;
  let mouseY = 0;

  const ratio = window.devicePixelRatio || 1;
  canvas.width = ratio * widthPx;
  canvas.height = ratio * heightPx;

  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });

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

  const [head, pistol, body, bullet, runningBody] = await Promise.all([
    makeSquareSprite({ src: "assets/Hero-Head.png", name: "Head Normal", gl }),
    makeSquareSprite({
      src: "assets/Pistol Arm.png",
      gl,
      originX: 60,
      originY: 112,
    }),
    makeSquareSprite({
      src: "assets/Hero-Body-Static.png",
      gl,
    }),
    makeSquareSprite({
      src: "assets/Bullet.png",
      gl,
      originX: 32,
      originY: 23 / 2,
    }),
    makeAnimSprite({
      src: "assets/Body Hero Running.png",
      gl,
    }),
  ]);

  const objects = TEST_DATA.map(({ positions, cells }) => {
    const posData = new Float32Array(hexToBuffer(positions));
    const cellData = new Uint16Array(hexToBuffer(cells));

    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, posData, gl.STATIC_DRAW);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cellData, gl.STATIC_DRAW);

    return {
      vertexBuffer,
      indexBuffer,
      numPoints: cellData.length,
    };
  });

  let prevRun = Date.now() / 1000;
  let fps = 60;

  let percentageDoneTime = -1;

  let percentage = 0;
  let zoom = 5.9;
  let x = 0;
  let y = 0;

  function render() {
    percentage = percentage + 1 / (0.2 * 60);

    if (percentage >= objects.length && percentageDoneTime === -1) {
      percentageDoneTime = prevRun;
    }

    let dx = input.getSignOfAction("left", "right");
    let dy = input.getSignOfAction("down", "up");
    if (dy && dx) {
      const sqrt2inv = 0.7071;
      dx *= sqrt2inv;
      dy *= sqrt2inv;
    }
    x += 6 * dx;
    y += 6 * dy;

    renderInProgram(svgProgram, (gl) => {
      useMatrixStack(svgProgram.inputs.projection);

      gl.clearColor(
        backgroundColor[0],
        backgroundColor[1],
        backgroundColor[2],
        1
      );
      gl.clear(gl.COLOR_BUFFER_BIT);

      scaleAxes(zoom, zoom, 0);

      shiftContent(-0.35, -0.85, 0);

      shiftContent(-1, 1, 0);
      scaleAxes(2 / 960, -2 / 640, 1);

      const position = svgProgram.attr("a_position");
      gl.enableVertexAttribArray(position);

      objects.forEach((obj, index) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, obj.vertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, obj.indexBuffer);
        gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);

        gl.drawElements(gl.TRIANGLES, obj.numPoints, gl.UNSIGNED_SHORT, 0);
      });
    });

    renderInProgram(rasterProgram, (gl) => {
      gl.activeTexture(gl.TEXTURE0);
      rasterProgram.inputs.texture.set(0);

      const position = rasterProgram.attr("a_position");
      gl.enableVertexAttribArray(position);
      const texturePosition = rasterProgram.attr("a_texturePosition");
      gl.enableVertexAttribArray(texturePosition);

      useMatrixStack(rasterProgram.inputs.projection);

      // shiftContent(-1, 1, 0);
      scaleAxes(2 / 960, 2 / 640, 1);

      gl.bindBuffer(gl.ARRAY_BUFFER, bullet.buffer);
      bullet.texture.bindTexture();
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(texturePosition, 2, gl.FLOAT, false, 20, 12);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      shiftContent(x, y, 0);

      const mirrorX = mouseX < x;
      if (mirrorX) {
        scaleAxes(-1, 1, 1);
      }

      subrender(() => {
        const xDiff = 0;
        const yDiff = 40;
        shiftContent(xDiff, yDiff, 0);
        const angle = mirrorX
          ? arctan(mouseY - (y + yDiff), x + xDiff - mouseX) - 0.3
          : arctan(mouseY - (y + yDiff), mouseX - (x + xDiff)) - 0.3;

        rotateAboutZ(angle);

        gl.bindBuffer(gl.ARRAY_BUFFER, pistol.buffer);
        pistol.texture.bindTexture();
        gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 20, 0);
        gl.vertexAttribPointer(texturePosition, 2, gl.FLOAT, false, 20, 12);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      });

      if (dx || dy) {
        const frame =
          Math.floor(prevRun * 12) % runningBody.startIndices.length;
        gl.bindBuffer(gl.ARRAY_BUFFER, runningBody.buffer);
        runningBody.texture.bindTexture();
        gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 20, 0);
        gl.vertexAttribPointer(texturePosition, 2, gl.FLOAT, false, 20, 12);
        gl.drawArrays(gl.TRIANGLE_STRIP, runningBody.startIndices[frame], 4);
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, body.buffer);
        body.texture.bindTexture();
        gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 20, 0);
        gl.vertexAttribPointer(texturePosition, 2, gl.FLOAT, false, 20, 12);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, head.buffer);
      head.texture.bindTexture();
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(texturePosition, 2, gl.FLOAT, false, 20, 12);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });

    if (fpsNode) {
      const now = Date.now() / 1000;
      const diff = now - prevRun;
      const nowFps = 1 / diff;
      const weight = 0.2;
      fps = nowFps * weight + fps * (1 - weight);
      fpsNode.innerText = `${Math.round(fps)} fps`;
      prevRun = now;
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);

  canvas.onmousemove = (event) => {
    mouseX = event.offsetX - widthPx / 2;
    mouseY = heightPx / 2 - event.offsetY;
  };
}

window["onload"] = onLoad;

/**
 *
 * @param {Object} options
 * @param {string} options.src
 * @param {string=} options.name
 * @param {WebGL} options.gl
 * @param {number=} options.originX
 * @param {number=} options.originY
 * @returns Promise<{{texture: Texture, buffer: number}}>
 */
async function makeSquareSprite(options) {
  const gl = options.gl;
  const texture = await loadTextureFromImgUrl({
    src: options.src,
    name: options.name || options.src,
    gl,
  });

  const rescale = 0.5;

  let width = texture.w;
  let height = texture.h;
  let { originX = width / 2, originY = height } = options;

  width *= rescale;
  height *= rescale;
  originX *= rescale;
  originY *= rescale;

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // prettier-ignore
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -originX, originY, 0, 0, 0,
    -originX, originY - height, 0, 0, 1,
    width - originX, originY, 0, 1, 0,
    width - originX, originY - height, 0, 1, 1,
  ]), gl.STATIC_DRAW);

  return {
    texture,
    buffer,
  };
}

/**
 *
 * @param {Object} options
 * @param {string} options.src
 * @param {string=} options.name
 * @param {WebGL} options.gl
 * @param {number=} options.originX
 * @param {number=} options.originY
 * @returns Promise<{{texture: Texture, buffer: number}}>
 */
async function makeAnimSprite(options) {
  const gl = options.gl;
  const texture = await loadTextureFromImgUrl({
    src: options.src,
    name: options.name || options.src,
    gl,
  });

  const rescale = 0.5;
  const firstFrame = BODY_RUNNING_DATA.frames[0];

  let width = firstFrame.sourceSize.w;
  let height = firstFrame.sourceSize.h;
  let { originX = width / 2, originY = height } = options;

  width *= rescale;
  height *= rescale;
  originX *= rescale;
  originY *= rescale;

  const bufferData = [];
  const startIndices = [];
  BODY_RUNNING_DATA.frames.forEach(({ frame }, index) => {
    const x = frame.x / texture.w;
    const w = frame.w / texture.w;
    const y = frame.y / texture.h;
    const h = frame.h / texture.h;

    startIndices.push(index * 4);
    bufferData.push(-originX, originY, 0, x, y);
    bufferData.push(-originX, originY - height, 0, x, y + h);
    bufferData.push(width - originX, originY, 0, x + w, y);
    bufferData.push(width - originX, originY - height, 0, x + w, y + h);
  });

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // prettier-ignore
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bufferData), gl.STATIC_DRAW);

  return {
    texture,
    buffer,
    startIndices,
  };
}

/**
 * Returns the angle given the opposite and adjacent sides. If both are 0, then the angle 0 is returned.
 * @param {number} opposite - The "opposite" side of the triangle (most likely, the y difference)
 * @param {number} adjacent - The "adjacent" side of the triangle (most likely, the x difference)
 * @returns {number} The angle
 */
export function arctan(opposite, adjacent) {
  if (adjacent > 0) {
    return Math.atan(opposite / adjacent);
  } else if (adjacent === 0) {
    if (opposite > 0) {
      return Math.PI / 2;
    } else if (opposite === 0) {
      return 0; // dunno what is best here
    } else {
      return -Math.PI / 2;
    }
  } else {
    return Math.atan(opposite / adjacent) + Math.PI;
  }
}

const BODY_RUNNING_DATA = {
  frames: [
    {
      filename: "Body Running.swf0000",
      frame: { x: 0, y: 0, w: 88, h: 89 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 88, h: 89 },
      sourceSize: { w: 88, h: 89 },
    },
    {
      filename: "Body Running.swf0001",
      frame: { x: 0, y: 0, w: 88, h: 89 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 88, h: 89 },
      sourceSize: { w: 88, h: 89 },
    },
    {
      filename: "Body Running.swf0002",
      frame: { x: 88, y: 0, w: 88, h: 89 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 88, h: 89 },
      sourceSize: { w: 88, h: 89 },
    },
    {
      filename: "Body Running.swf0003",
      frame: { x: 88, y: 0, w: 88, h: 89 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 88, h: 89 },
      sourceSize: { w: 88, h: 89 },
    },
    {
      filename: "Body Running.swf0004",
      frame: { x: 0, y: 89, w: 88, h: 89 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 88, h: 89 },
      sourceSize: { w: 88, h: 89 },
    },
    {
      filename: "Body Running.swf0005",
      frame: { x: 0, y: 89, w: 88, h: 89 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 88, h: 89 },
      sourceSize: { w: 88, h: 89 },
    },
    {
      filename: "Body Running.swf0006",
      frame: { x: 88, y: 89, w: 88, h: 89 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 88, h: 89 },
      sourceSize: { w: 88, h: 89 },
    },
  ],
  meta: {
    app: "Adobe Animate",
    version: "20.5.1.31044",
    image: "Body Hero Running.png",
    format: "RGBA8888",
    size: { w: 256, h: 256 },
    scale: "1",
  },
};
