import { SceneStep, GameObject, Scene, fireBullet } from "../Scene.js";
import { SceneScriptRunner } from "../SceneScriptRunner.js";
import { magnitudeOf } from "../utils.js";

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

    const hero = scene.hero;
    if (magnitudeOf(hero.x - object.x, hero.y - object.y, 0) < 300) {
      scene.exiting = "big bad";
    }

    return shakeCage;
  }

  return shakeCage;
}
