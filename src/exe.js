import {
  Program,
  makeAndLinkProgram,
  renderInProgram,
} from "../wattle/engine/src/swagl/Program.js";
import { Mat4fv } from "../wattle/engine/src/swagl/ProgramInput.js";

function onLoad() {
  const maybeCanvas = document.getElementById("canvas");
  /** @type {HTMLCanvasElement} */
  const canvas = maybeCanvas instanceof HTMLCanvasElement ? maybeCanvas : null;

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
  canvas.width = ratio * canvas.width;
  canvas.height = ratio * canvas.height;

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
  const testData = [
    1, 0, 0,
    0, 1, 0,
    -1, 0, 0,
    0, -1, 0,
  ];

  // const texture = gl.createTexture();

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(testData), gl.STATIC_DRAW);

  renderInProgram(program, (gl) => {
    // prettier-ignore
    program.inputs.projection.set(
      .5, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    );

    gl.clearColor(
      backgroundColor[0],
      backgroundColor[1],
      backgroundColor[2],
      1
    );
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    const position = program.attr("a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINE_LOOP, 0, testData.length / 3);
  });

  console.log("hola");
}

window["onload"] = onLoad;
