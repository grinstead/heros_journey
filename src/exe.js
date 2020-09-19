import {
  Program,
  makeAndLinkProgram,
  renderInProgram,
} from "../wattle/engine/src/swagl/Program.js";
import { Mat4fv } from "../wattle/engine/src/swagl/ProgramInput.js";
import { TEST_DATA } from "./data.js";
import { hexToBuffer } from "./hex.js";

function onLoad() {
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

  /** @type {!Program<{projection:Mat4fv}>} */
  const program = makeAndLinkProgram({
    name: "main",
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
    output_color = vec4(0.f, 0.f, 0.f, 1.f);
  }`,
      },
    },
  });

  // prettier-ignore
  // const testData = new Float32Array([
  //   400, 0, 0,
  //   0, 100, 0,
  //   -400, 0, 0,
  //   0, -100, 0,
  // ]);
  const testVertexData = new Float32Array(hexToBuffer(TEST_DATA.positions));
  const testIndexData = new Uint16Array(hexToBuffer(TEST_DATA.cells));

  // const texture = gl.createTexture();

  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, testVertexData, gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, testIndexData, gl.STATIC_DRAW);

  console.log(testVertexData);

  let prevRun = Date.now() / 1000;

  function render() {
    renderInProgram(program, (gl) => {
      let zoom = 10 * (Math.sin(prevRun) + 1) + 1;

      // prettier-ignore
      program.inputs.projection.set(
        zoom * 2/960, 0, 0, 0,
        0, zoom * 2/640, 0, 0,
        0, 0, 1, 0,
        zoom * -1, zoom * .1, 0, 1,
      );

      gl.clearColor(
        backgroundColor[0],
        backgroundColor[1],
        backgroundColor[2],
        1
      );
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

      const position = program.attr("a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
      gl.drawElements(gl.TRIANGLES, testIndexData.length, gl.UNSIGNED_SHORT, 0);
    });

    if (fpsNode) {
      const now = Date.now() / 1000;
      const diff = now - prevRun;
      const fps = 1 / diff;
      if (fps > 58) {
        fpsNode.innerText = "~60 fps";
      } else {
        fpsNode.innerText = `${Math.round(fps)} fps`;
      }
      prevRun = now;
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

window["onload"] = onLoad;
