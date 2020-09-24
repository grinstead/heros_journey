import { GameObject, Scene, SceneStep } from "../Scene.js";
import { SpriteBuilder } from "../Sprite.js";

/**
 * @param {Scene} scene
 * @param {GameObject} object
 * @param {SpriteBuilder} makeSprite
 * @param {string} soundName
 * @returns {SceneStep}
 */

export function killOffEnemy(scene, object, makeSprite, soundName) {
  // the max is just precautionary
  scene.inFight = Math.max(0, scene.inFight - 1);

  const sprite = makeSprite(scene.sceneTime);
  object.sprite = sprite;
  object.render = null;
  object.speed = 0;
  object.zSpeed = 0;
  object.z = 0;
  object.showDamageUntil = -1;

  scene.audio.playNamedSound(object, soundName);

  function waitUntilDeath() {
    sprite.updateTime(scene.sceneTime);

    if (!sprite.isFinished()) return waitUntilDeath;

    return null;
  }

  return waitUntilDeath();
}
