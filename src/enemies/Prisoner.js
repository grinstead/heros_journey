import { SceneStep, GameObject, Scene, fireBullet } from "../Scene.js";
import { SceneScriptRunner } from "../SceneScriptRunner.js";
import { magnitudeOf } from "../utils.js";
import {
  shiftContent,
  rotateAboutY,
  rotateAboutZ,
} from "../../wattle/engine/src/swagl/MatrixStack.js";
import { subrenderSprite } from "../Sprite.js";

/**
 * @param {SceneScriptRunner} runner
 * @param {GameObject} object
 * @returns {SceneStep}
 */
export function prisonerShaking(runner, object) {
  const scene = runner.scene;

  object.sprite.resetSprite(scene.sceneTime);
  scene.audio.playNamedSound(object, "SlaveCage");

  function shakeCage() {
    object.sprite.updateTime(scene.sceneTime);

    if (object.sprite.isFinished()) {
      object.sprite.resetSprite(scene.sceneTime);
      scene.audio.playNamedSound(object, "SlaveCage");
    }

    return shakeCage;
  }

  return shakeCage;
}

/**
 *
 * @param {SceneScriptRunner} runner
 * @param {GameObject} object
 */
export function prisonerKnockedOver(runner, object) {
  const scene = runner.scene;
  const startTime = scene.sceneTime;

  const sprite = object.sprite;
  sprite.resetSprite(startTime);
  object.render = () => {
    rotateAboutY(8 * (scene.sceneTime - startTime));
    sprite.prepareSpriteType();
    subrenderSprite(sprite);
  };

  let xSpeed = 1000;
  let zSpeed = 2400;
  const gravity = 4000;

  object.zSpeed = zSpeed;
  object.speed = xSpeed;
  object.direction = xSpeed >= 0 ? 0 : Math.PI;

  function step() {
    const sceneTime = scene.sceneTime;
    sprite.updateTime(sceneTime);
    object.zSpeed -= gravity * scene.stepSize;
    if (object.z < 0) {
      object.zSpeed = 0;
      object.z = 0;
    }

    if (sceneTime - startTime > 2) {
      // todo replace with broken cage
      scene.object = scene.objects.filter((x) => x !== object);
      return null;
    }

    return step;
  }

  return step;
}
