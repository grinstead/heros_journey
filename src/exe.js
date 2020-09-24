import { makeGame, Game } from "./Game.js";
import { InputManager } from "../wattle/engine/src/InputManager.js";
import { cleanUpObject } from "../wattle/engine/src/utils/raii.js";

/** @type {?Game} */
let game = null;
/** @type {HTMLCanvasElement} */
let maybeCanvas = null;
let shouldRun = false;
const mousePosition = { x: 0, y: 0 };

function startGame() {
  document.getElementById("intro").remove();

  maybeCanvas.addEventListener("mousemove", (event) => {
    mousePosition.x = event.offsetX;
    mousePosition.y = event.offsetY;
  });

  // const gameActions = document.getElementById("gameActions");
  // gameActions.classList.remove("hidden");

  // maybeCanvas.addEventListener("dblclick", () => {
  //   maybeCanvas.requestFullscreen();
  // });

  // const fullscreen = document.getElementById("fullscreen");
  // fullscreen.addEventListener("click", () => {
  //   canvas.requestFullscreen();
  // });

  game.startRunning();
}

function prepareStartButton() {
  const intro = document.getElementById("intro");
  intro.innerHTML = '<button id="start" class="button">Start</button>';

  const start = document.getElementById("start");

  start.addEventListener(
    "click",
    () => {
      startGame();
    },
    { once: true }
  );
}

async function onLoad() {
  maybeCanvas = document.getElementById("canvas");
  /** @type {HTMLCanvasElement} */
  const canvas = maybeCanvas instanceof HTMLCanvasElement ? maybeCanvas : null;

  if (!canvas) throw new Error("Bad Canvas");

  prepareStartButton();

  game = await makeGame({
    canvas,
    input: new InputManager(document.body),
    mousePosition,
  });

  prepareStartButton();

  if (shouldRun) {
    game.startRunning();
  }

  // for debugging
  window["debug"] = game;

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
