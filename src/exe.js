import { makeGame, Game } from "./Game.js";
import { InputManager } from "../wattle/engine/src/InputManager.js";
import { cleanUpObject } from "../wattle/engine/src/utils/raii.js";
import { updateSceneTime } from "./World.js";

/** @type {?Game} */
let game = null;

async function onLoad() {
  const maybeCanvas = document.getElementById("canvas");
  /** @type {HTMLCanvasElement} */
  const canvas = maybeCanvas instanceof HTMLCanvasElement ? maybeCanvas : null;

  if (!canvas) throw new Error("Bad Canvas");

  const mousePosition = { x: 0, y: 0 };
  canvas.onmousemove = (event) => {
    mousePosition.x = event.offsetX;
    mousePosition.y = event.offsetY;
  };

  game = await makeGame({
    canvas,
    input: new InputManager(document.body),
    mousePosition,
  });

  game.startRunning();

  const fpsNode = document.getElementById("fps");
  if (fpsNode) {
    const updateFps = () => {
      fpsNode.innerText = `${Math.round(game.fps)} fps`;
      if (game.isRunning) {
        requestAnimationFrame(updateFps);
      }
    };
    requestAnimationFrame(updateFps);
  }
}

window["onload"] = onLoad;
window["onbeforeunload"] = () => {
  if (game) {
    game.stopRunning();
    cleanUpObject(game);
  }
};

// const RESCALE = 2;

// async function onLoad() {
//   const input = new InputManager(document.body);
//   input.setKeysForAction("up", ["w", "ArrowUp"]);
//   input.setKeysForAction("down", ["s", "ArrowDown"]);
//   input.setKeysForAction("left", ["a", "ArrowLeft"]);
//   input.setKeysForAction("right", ["d", "ArrowRight"]);
//   input.setKeysForAction("shoot", ["h", " "]);

//   const maybeCanvas = document.getElementById("canvas");
//   /** @type {HTMLCanvasElement} */
//   const canvas = maybeCanvas instanceof HTMLCanvasElement ? maybeCanvas : null;

//   const fpsNode = document.getElementById("fps");

//   const computedStyle = getComputedStyle(canvas);

//   const baseBackgroundColor = /rgb\((\d+), (\d+), (\d+)\)/.exec(
//     computedStyle.getPropertyValue("background-color")
//   );

//   const backgroundColor = [
//     baseBackgroundColor[1] / 255, // implicit conversion
//     baseBackgroundColor[2] / 255, // implicit conversion
//     baseBackgroundColor[3] / 255, // implicit conversion
//   ];

//   const widthPx =
//     parseInt(computedStyle.getPropertyValue("width"), 10) * RESCALE;
//   const heightPx =
//     parseInt(computedStyle.getPropertyValue("height"), 10) * RESCALE;

//   let mouseX = 0;
//   let mouseY = 0;

//   const ratio = window.devicePixelRatio || 1;
//   canvas.width = (ratio * widthPx) / RESCALE;
//   canvas.height = (ratio * heightPx) / RESCALE;

//   /**
//    * Not sure why, but closure is crapping up here
//    * @suppress {checkTypes}
//    * @type {!WebGL}
//    */
//   const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });

//   gl.enable(gl.BLEND);
//   gl.enable(gl.DEPTH_TEST);
//   gl.depthFunc(gl.LEQUAL);

//   /** @type {!Program<{projection:!Mat4fv}>} */
//   const svgProgram = makeAndLinkProgram({
//     name: "svg",
//     gl,
//     inputs: {
//       projection: new Mat4fv("u_projection"),
//     },
//     shaders: {
//       vertex: {
//         name: "vertex",
//         code: `#version 300 es
//   in vec3 a_position;
//   uniform mat4 u_projection;

//   void main() {
//     gl_Position = u_projection * vec4(a_position, 1);
//   }`,
//       },
//       fragment: {
//         name: "fragment",
//         code: `#version 300 es
//   precision highp float;

//   out vec4 output_color;

//   void main() {
//     output_color = vec4(0.9f, 0.9f, 0.9f, 1.0f);
//   }`,
//       },
//     },
//   });

//   /** @type {!Program<{projection:!Mat4fv,texture:!SingleInt}>} */
//   const rasterProgram = makeAndLinkProgram({
//     name: "raster",
//     gl,
//     inputs: {
//       projection: new Mat4fv("u_projection"),
//       texture: new SingleInt("u_texture"),
//     },
//     shaders: {
//       vertex: {
//         name: "vertex",
//         code: `#version 300 es
// in vec3 a_position;
// in vec2 a_texturePosition;

// uniform mat4 u_projection;

// out vec4 v_clipSpace;
// out vec2 v_texturePosition;

// void main() {
//   gl_Position = u_projection * vec4(a_position, 1);
//   v_texturePosition = a_texturePosition;
// }`,
//       },
//       fragment: {
//         name: "fragment",
//         code: `#version 300 es
// precision highp float;

// uniform sampler2D u_texture;

// in vec2 v_texturePosition;
// out vec4 output_color;

// void main() {
//   vec4 color = texture(u_texture, v_texturePosition.st);
//   if (color.a == 0.0) {
//       discard;
//   }

//   output_color = color;
// }`,
//       },
//     },
//   });

//   const [runningBody] = await Promise.all([
//     makeAnimSprite({
//       src: "assets/Body Hero Running.png",
//       gl,
//     }),
//     loadAllSpriteTextures(gl),
//   ]);

//   const objects = TEST_DATA.map(({ positions, cells }) => {
//     const posData = new Float32Array(hexToBuffer(positions));
//     const cellData = new Uint16Array(hexToBuffer(cells));

//     const vertexBuffer = gl.createBuffer();
//     gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
//     gl.bufferData(gl.ARRAY_BUFFER, posData, gl.STATIC_DRAW);

//     const indexBuffer = gl.createBuffer();
//     gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
//     gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cellData, gl.STATIC_DRAW);

//     return {
//       vertexBuffer,
//       indexBuffer,
//       numPoints: cellData.length,
//     };
//   });

//   let now = Date.now() / 1000;
//   let fps = 60;

//   let percentageDoneTime = -1;

//   const NOZZLE_X = 96;
//   const NOZZLE_Y = 50;
//   const ARM_POS = {
//     x: 0,
//     y: 80,
//     nozzleAngleFromShoulder: Math.atan(NOZZLE_Y / NOZZLE_X),
//     nozzleDistanceFromShoulder: Math.sqrt(
//       NOZZLE_X * NOZZLE_X + NOZZLE_Y * NOZZLE_Y
//     ),
//   };

//   let percentage = 0;
//   let zoom = 6;
//   const hero = {
//     x: 0,
//     y: 0,
//     dx: 0,
//     dy: 0,
//     mirrorX: false,
//     armDirection: 0,
//   };

//   const head = makeHeroHead(now);
//   const pistol = makePistolArm(now);
//   const bulletSprite = makeBullet(now);
//   const monsterTruck = makeHeroJump(now);
//   const body = makeHeroBodyStatic(now);

//   /** @type {!Array<{x: number, y: number, direction: number, speed: number, startTime: number, dead: boolean}>} */
//   let bullets = [];

//   function performStep() {
//     const prevRun = now;
//     now = Date.now() / 1000;
//     const stepTime = now - prevRun;

//     if (fpsNode) {
//       const nowFps = 1 / stepTime;
//       const weight = 0.1;
//       fps = nowFps * weight + fps * (1 - weight);
//       fpsNode.innerText = `${Math.round(fps)} fps`;
//     }

//     percentage = percentage + 1 / (0.2 * 60);

//     if (percentage >= objects.length && percentageDoneTime === -1) {
//       percentageDoneTime = prevRun;
//     }

//     let dx = input.getSignOfAction("left", "right");
//     let dy = input.getSignOfAction("down", "up");
//     if (dy && dx) {
//       const sqrt2inv = 0.7071;
//       dx *= sqrt2inv;
//       dy *= sqrt2inv;
//     }
//     const heroChange = 640 * stepTime;
//     hero.x += hero.dx = heroChange * dx;
//     hero.y += hero.dy = heroChange * dy;

//     const mirrorX = mouseX < hero.x;
//     const targetDy = mouseY - (hero.y + ARM_POS.y);
//     const targetDx = mouseX - (hero.x + ARM_POS.x);

//     hero.mirrorX = mirrorX;
//     hero.armDirection = arctan(targetDy, mirrorX ? -targetDx : targetDx) - 0.3;

//     if (input.numPresses("shoot")) {
//       let direction = hero.armDirection;
//       let angle = ARM_POS.nozzleAngleFromShoulder;
//       if (mirrorX) {
//         direction = Math.PI - direction;
//         angle = -angle;
//       }

//       bullets.push({
//         x:
//           hero.x +
//           (mirrorX ? -ARM_POS.x : ARM_POS.x) +
//           ARM_POS.nozzleDistanceFromShoulder * Math.cos(direction + angle),
//         y:
//           hero.y +
//           ARM_POS.y +
//           ARM_POS.nozzleDistanceFromShoulder * Math.sin(direction + angle),
//         direction,
//         speed: 400,
//         startTime: now,
//         dead: false,
//       });
//     }

//     let numDead = 0;
//     bullets.forEach((bullet) => {
//       if (bullet.dead) {
//         numDead++;
//         return;
//       }

//       const { speed, direction } = bullet;
//       const change = speed * stepTime;
//       const dx = change * Math.cos(direction);
//       const dy = change * Math.sin(direction);
//       bullet.x += dx;
//       bullet.y += dy;

//       if (bullet.startTime <= now - 4) {
//         bullet.dead = true;
//         numDead++;
//       }
//     });

//     if (numDead > 100) {
//       bullets = bullets.filter((b) => !b.dead);
//     }

//     render();

//     requestAnimationFrame(performStep);
//   }

//   function render() {
//     renderInProgram(svgProgram, (gl) => {
//       useMatrixStack(svgProgram.inputs.projection);

//       gl.clearColor(
//         backgroundColor[0],
//         backgroundColor[1],
//         backgroundColor[2],
//         1
//       );
//       gl.clear(gl.COLOR_BUFFER_BIT);

//       scaleAxes(zoom, zoom, 0);

//       shiftContent(-0.35, -0.65, 0);

//       shiftContent(-1, 1, 0);
//       scaleAxes(2 / 960, -2 / 640, 1);

//       const position = svgProgram.attr("a_position");
//       gl.enableVertexAttribArray(position);

//       objects.forEach((obj, index) => {
//         gl.bindBuffer(gl.ARRAY_BUFFER, obj.vertexBuffer);
//         gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, obj.indexBuffer);
//         gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);

//         gl.drawElements(gl.TRIANGLES, obj.numPoints, gl.UNSIGNED_SHORT, 0);
//       });
//     });

//     renderInProgram(rasterProgram, (gl) => {
//       gl.activeTexture(gl.TEXTURE0);
//       rasterProgram.inputs.texture.set(0);

//       const position = rasterProgram.attr("a_position");
//       gl.enableVertexAttribArray(position);
//       const texturePosition = rasterProgram.attr("a_texturePosition");
//       gl.enableVertexAttribArray(texturePosition);

//       useMatrixStack(rasterProgram.inputs.projection);

//       scaleAxes(2 / widthPx, 2 / heightPx, 1);

//       monsterTruck.updateTime(now);
//       monsterTruck.bindSpriteType(position, texturePosition);
//       subrenderSprite(monsterTruck);

//       bulletSprite.bindSpriteType(position, texturePosition);
//       subrenderEach(bullets, (bullet) => {
//         if (bullet.dead) return;

//         shiftContent(bullet.x, bullet.y, 0);
//         rotateAboutZ(bullet.direction);
//         subrenderSprite(bulletSprite);
//       });

//       const { x, y } = hero;
//       shiftContent(x, y, 0);

//       if (hero.mirrorX) scaleAxes(-1, 1, 1);

//       subrender(() => {
//         shiftContent(ARM_POS.x, ARM_POS.y, 0);
//         rotateAboutZ(hero.armDirection);
//         pistol.bindSpriteType(position, texturePosition);
//         subrenderSprite(pistol);
//       });

//       if (hero.dx || hero.dy) {
//         const frame = Math.floor(now * 12) % runningBody.startIndices.length;
//         gl.bindBuffer(gl.ARRAY_BUFFER, runningBody.buffer);
//         runningBody.texture.bindTexture();
//         gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 20, 0);
//         gl.vertexAttribPointer(texturePosition, 2, gl.FLOAT, false, 20, 12);
//         gl.drawArrays(gl.TRIANGLE_STRIP, runningBody.startIndices[frame], 4);
//       } else {
//         body.bindSpriteType(position, texturePosition);
//         subrenderSprite(body);
//       }

//       head.bindSpriteType(position, texturePosition);
//       subrenderSprite(head);
//     });
//   }

//   requestAnimationFrame(performStep);

//   canvas.onmousemove = (event) => {
//     mouseX = event.offsetX * RESCALE - widthPx / 2;
//     mouseY = -(event.offsetY * RESCALE - heightPx / 2);
//   };
// }

// window["onload"] = onLoad;

// /**
//  *
//  * @param {Object} options
//  * @param {string} options.src
//  * @param {string=} options.name
//  * @param {WebGL} options.gl
//  * @param {number=} options.originX
//  * @param {number=} options.originY
//  * @returns Promise<{{texture: Texture, buffer: number}}>
//  */
// async function makeSquareSprite(options) {
//   const gl = options.gl;
//   const texture = await loadTextureFromImgUrl({
//     src: options.src,
//     name: options.name || options.src,
//     gl,
//   });

//   let width = texture.w;
//   let height = texture.h;
//   let { originX = width / 2, originY = height } = options;

//   const buffer = gl.createBuffer();
//   gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
//   // prettier-ignore
//   gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
//     -originX, originY, 0, 0, 0,
//     -originX, originY - height, 0, 0, 1,
//     width - originX, originY, 0, 1, 0,
//     width - originX, originY - height, 0, 1, 1,
//   ]), gl.STATIC_DRAW);

//   return {
//     texture,
//     buffer,
//   };
// }

// /**
//  *
//  * @param {Object} options
//  * @param {string} options.src
//  * @param {string=} options.name
//  * @param {WebGL} options.gl
//  * @param {number=} options.originX
//  * @param {number=} options.originY
//  * @returns Promise<{{texture: Texture, buffer: number}}>
//  */
// async function makeAnimSprite(options) {
//   const gl = options.gl;
//   const texture = await loadTextureFromImgUrl({
//     src: options.src,
//     name: options.name || options.src,
//     gl,
//   });

//   const firstFrame = BODY_RUNNING_DATA.frames[0];

//   let width = firstFrame.sourceSize.w;
//   let height = firstFrame.sourceSize.h;
//   let { originX = width / 2, originY = height } = options;

//   const bufferData = [];
//   const startIndices = [];
//   BODY_RUNNING_DATA.frames.forEach(({ frame }, index) => {
//     const x = frame.x / texture.w;
//     const w = frame.w / texture.w;
//     const y = frame.y / texture.h;
//     const h = frame.h / texture.h;

//     startIndices.push(index * 4);
//     bufferData.push(-originX, originY, 0, x, y);
//     bufferData.push(-originX, originY - height, 0, x, y + h);
//     bufferData.push(width - originX, originY, 0, x + w, y);
//     bufferData.push(width - originX, originY - height, 0, x + w, y + h);
//   });

//   const buffer = gl.createBuffer();
//   gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
//   // prettier-ignore
//   gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bufferData), gl.STATIC_DRAW);

//   return {
//     texture,
//     buffer,
//     startIndices,
//   };
// }

// /**
//  * Returns the angle given the opposite and adjacent sides. If both are 0, then the angle 0 is returned.
//  * @param {number} opposite - The "opposite" side of the triangle (most likely, the y difference)
//  * @param {number} adjacent - The "adjacent" side of the triangle (most likely, the x difference)
//  * @returns {number} The angle
//  */
// export function arctan(opposite, adjacent) {
//   if (adjacent > 0) {
//     return Math.atan(opposite / adjacent);
//   } else if (adjacent === 0) {
//     if (opposite > 0) {
//       return Math.PI / 2;
//     } else if (opposite === 0) {
//       return 0; // dunno what is best here
//     } else {
//       return -Math.PI / 2;
//     }
//   } else {
//     return Math.atan(opposite / adjacent) + Math.PI;
//   }
// }
