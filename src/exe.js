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

  const objects = TEST_DATA.map(({positions, cells}) => {
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
  })

  let prevRun = Date.now() / 1000;
  let fps = 60;

  let percentageDoneTime = -1;

  let percentage = 0;

  function render() {
    renderInProgram(program, (gl) => {
      percentage = percentage + 1 / (0.2 * 60);

      if (percentage >= objects.length && percentageDoneTime === -1) {
        percentageDoneTime = prevRun;
      }

      let zoom =
        percentageDoneTime !== -1
          ? 10 * ((1 - Math.cos(prevRun - percentageDoneTime)) / 2) + 1
          : 1;

      // prettier-ignore
      program.inputs.projection.set(
        zoom * 2/960, 0, 0, 0,
        0, zoom * -2/640, 0, 0,
        0, 0, 1, 0,
        zoom * -1.1, zoom * .1, 0, 1,
      );

      gl.clearColor(
        backgroundColor[0],
        backgroundColor[1],
        backgroundColor[2],
        1
      );
      gl.clear(gl.COLOR_BUFFER_BIT);

      const position = program.attr("a_position");
      gl.enableVertexAttribArray(position);

      objects.forEach((obj, index) => {
        let numPoints = obj.numPoints;
        const objPer = Math.max(percentage - index, 0);
        if (objPer < 1) {
          numPoints = 3 * Math.floor((numPoints / 3) * objPer);
        }

        if (numPoints === 0) return;

        gl.bindBuffer(gl.ARRAY_BUFFER, obj.vertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, obj.indexBuffer);
        gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);

        gl.drawElements(
          gl.TRIANGLES,
          numPoints,
          gl.UNSIGNED_SHORT,
          2 * (obj.numPoints - numPoints)
        );
      });
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
