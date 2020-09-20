import { readFileSync, writeFileSync } from "fs";
import { bufferToHex, hexToBuffer } from "../src/hex.js";

const RESCALE = 1;

function processSpriteAtlas(folder) {
  const rawAnim = JSON.parse(
    readFileSync(`${folder}/Animation.json`, "utf8").trim()
  );
  const rawSpriteMap = JSON.parse(
    readFileSync(`${folder}/spritemap1.json`, "utf8").trim()
  );

  /** @type {!Map<string, number>} */
  const nameToIndices = new Map();
  /** @type {!Array<{x: number, y: number, w: number, h: number}>} */
  const texLocations = [];

  rawSpriteMap.ATLAS.SPRITES.forEach(({ SPRITE }, index) => {
    nameToIndices.set(SPRITE.name, index);
    texLocations.push({
      x: SPRITE.x,
      y: SPRITE.y,
      w: SPRITE.w,
      h: SPRITE.h,
    });
  });

  const size = readOrThrow(rawSpriteMap, "meta", "size");

  const name = rawAnim.ANIMATION.name.replace(/\s/g, "");

  // build up the symbols dictionary
  const symbols = new Map();
  if (rawAnim.SYMBOL_DICTIONARY) {
    rawAnim.SYMBOL_DICTIONARY.Symbols.forEach((symbol) => {
      assert(symbol.TIMELINE.LAYERS.length === 1, "Too many layers in symbol");
      const frames = symbol.TIMELINE.LAYERS[0].Frames;
      assert(frames.length === 1, "Too many symbol frames");
      const elements = frames[0].elements;
      assert(elements.length === 1, "Too many symbol elements");

      symbols.set(symbol.SYMBOL_name, elements[0]);
    });
  }

  const layers = readOrThrow(rawAnim, "ANIMATION", "TIMELINE", "LAYERS");
  assert(layers.length === 1, "Too many layers!");

  const frames = layers[0].Frames.map((frame) => {
    const elements = frame.elements.map((start) => {
      let element = start;

      // resolve symbols
      while (element.SYMBOL_Instance) {
        element = symbols.get(element.SYMBOL_Instance.SYMBOL_name);
      }

      element = readOrThrow(element, "ATLAS_SPRITE_instance");

      const m = readOrThrow(element, "Matrix3D");

      // prettier-ignore
      const matrix = [
        m.m00, m.m01, m.m02, m.m03,
        m.m10, m.m11, m.m12, m.m13,
        m.m20, m.m21, m.m22, m.m23,
        m.m30, m.m31, m.m32, m.m33,
      ].map((scalar, index) => index % 4 !== 3 ? RESCALE * scalar : scalar);

      return {
        i: 4 * getOrThrow(nameToIndices, element.name),
        m: () => `new Float32Array([${matrix.join(",")}])`,
      };
    });

    return {
      holdFor: readOrThrow(frame, "duration"),
      elements,
    };
  });

  const fps = readOrThrow(rawAnim, "metadata", "framerate");
  const firstFrame = frames[0];
  const allSameFrameTime = frames.every(
    (f) => f.holdFor === firstFrame.holdFor
  );

  const bufferData = [];
  texLocations.forEach(({ x, y, w, h }) => {
    const x2 = x + w;
    const y2 = y + h;

    bufferData.push(0, 0, 0, x / size.w, y / size.h);
    bufferData.push(0, y2 - y, 0, x / size.w, y2 / size.h);
    bufferData.push(x2 - x, 0, 0, x2 / size.w, y / size.h);
    bufferData.push(x2 - x, y2 - y, 0, x2 / size.w, y2 / size.h);
  });

  const result = {
    name,
    src: `${folder}/spritemap1.png`,
    bufferData,
    loops: true,
    frameTime: allSameFrameTime
      ? firstFrame.holdFor / fps
      : frames.map((f) => f.holdFor / fps),
    perFrameData: null,
    frameElements: frames.map((f) => f.elements),
  };

  return `/** @type {SpriteBuilder} */
export const make${name} = defineAnimatedSprite(${printSimple(result)})`;
}

function main() {
  const lines = [];

  lines.push(processSpriteAtlas("./assets/Monster Truck Bad Guy"));
  lines.push(processSpriteAtlas("./assets/Hero Running Backwards"));

  const fileText = `// \x40generated from makeAssets.js
import {defineAnimatedSprite, SpriteBuilder} from './Sprite.js';

${lines.join("\n\n")}
`;

  writeFileSync("src/assets.js", fileText);
}

main();

function assert(condition, error) {
  if (!condition) {
    throw new Error(error);
  }
}

/**
 * @template K
 * @template V
 * @param {!Map<K, V>} map
 * @param {K} key
 * @returns {V}
 */
function getOrThrow(map, key) {
  if (map.has(key)) {
    return map.get(key);
  }

  throw new Error(`No value for "${key}"`);
}

function readOrThrow(obj, ...keys) {
  return keys.reduce((obj, key) => {
    if (obj.hasOwnProperty(key)) {
      return obj[key];
    }

    throw new Error(`No value in object for "${key}"`);
  }, obj);
}

/**
 * @param {?} val
 * @returns {string}
 */
function printSimple(val) {
  if (!val || typeof val === "number" || typeof val === "boolean") {
    return String(val);
  } else if (typeof val === "string") {
    return JSON.stringify(val);
  } else if (typeof val === "object") {
    if (Array.isArray(val)) {
      return `[${val.map(printSimple).join(",")}]`;
    }

    const parts = [];
    for (let key in val) {
      if (/[^a-zA-Z_0-9]/.test(key)) {
        throw new Error(`Bad key: ${JSON.stringify(key)}`);
      }

      parts.push(`${key}:${printSimple(val[key])}`);
    }

    return `{${parts.join(",")}}`;
  } else if (typeof val === "function") {
    const result = val();
    if (typeof result !== "string") {
      throw new Error(`Bad serializer`);
    }

    return result;
  } else {
    throw new Error(`Bad val: ${JSON.stringify(val)}`);
  }
}
