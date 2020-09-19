import {
  Program,
  makeAndLinkProgram,
  renderInProgram,
} from "../wattle/engine/src/swagl/Program.js";
import { Mat4fv, SingleInt } from "../wattle/engine/src/swagl/ProgramInput.js";
import { TEST_DATA } from "./data.js";
import { hexToBuffer } from "./hex.js";
import { InputManager } from "../wattle/engine/src/InputManager.js";
import { loadTextureFromImgUrl } from "../wattle/engine/src/swagl/Texture.js";
import {
  useMatrixStack,
  applyMatrixOperation,
  scaleAxes,
  shiftContent,
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

  const ratio = window.devicePixelRatio || 1;
  canvas.width = ratio * parseInt(computedStyle.getPropertyValue("width"), 10);
  canvas.height =
    ratio * parseInt(computedStyle.getPropertyValue("height"), 10);

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

  const head = await loadTextureFromImgUrl({
    src: "assets/Hero-Head.png",
    name: "Head Normal",
    gl,
  });

  const HeadSquare = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, HeadSquare);
  // prettier-ignore
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0, 0, 0, 0, 0,
    0, head.h / 2, 0, 0, 1,
    head.w / 2, 0, 0, 1, 0,
    head.w / 2, head.h / 2, 0, 1, 1,
  ]), gl.STATIC_DRAW);

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

    y += 0.01 * input.getSignOfAction("down", "up");
    x += 0.01 * input.getSignOfAction("left", "right");

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
      useMatrixStack(rasterProgram.inputs.projection);

      shiftContent(x, y, 0);

      shiftContent(-1, 1, 0);
      scaleAxes(2 / 960, -2 / 640, 1);

      const position = rasterProgram.attr("a_position");
      gl.enableVertexAttribArray(position);
      const texturePosition = rasterProgram.attr("a_texturePosition");
      gl.enableVertexAttribArray(texturePosition);

      gl.bindBuffer(gl.ARRAY_BUFFER, HeadSquare);
      gl.activeTexture(gl.TEXTURE0);
      head.bindTexture();
      rasterProgram.inputs.texture.set(0);
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
}

window["onload"] = onLoad;
