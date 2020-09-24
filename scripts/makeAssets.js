import { readFileSync, writeFileSync } from "fs";
import sizeOf from "image-size";
import {
  parseRawObject,
  processArray,
  processObjectArray,
  readOneOf,
  readString,
  hasKey,
  readNum,
  validateString,
  readBoolean,
} from "../src/PettyParser.js";

const capCamel = /^[A-Z][a-zA-Z]+$/;

// flip y, turn it into the z coordinate
// prettier-ignore
const BASE_TRANSFORM = [
  1, 0, 0, 0,
  0, 0, -1, 0,
  0, 1, 0, 0,
  0, 0, 0, 1,
];

function readName() {
  return validateString("name", (name) =>
    capCamel.test(name) ? null : "must be ThisSortOfForm"
  );
}

function main() {
  const rawScript = readFileSync("./assets/GameScript.json", "utf8");

  let hasSounds = false;
  let hasSprites = false;

  const lines = parseRawObject(rawScript, () => {
    return processObjectArray("assets", () => {
      const type = readOneOf("type", ["animated", "static", "audio"]);
      switch (type) {
        case "audio":
          hasSounds = true;
          return processSound({
            name: readString("name"),
            src: readString("src"),
          });
        case "animated":
          hasSprites = true;
          return processSpriteAtlas({
            name: readName(),
            src: readString("src"),
            originX: hasKey("originX") ? readNum("originX") : undefined,
            originY: hasKey("originY") ? readNum("originY") : undefined,
            loops: hasKey("loops") ? readBoolean("loops") : false,
          });
        case "static":
          hasSprites = true;
          return processStaticSprite({
            name: readName(),
            src: readString("src"),
            originX: hasKey("originX") ? readNum("originX") : undefined,
            originY: hasKey("originY") ? readNum("originY") : undefined,
          });
      }
    });
  });

  const imports = [
    hasSounds && 'import {registerSound} from "./AudioManager.js";',
    hasSprites && 'import {defineSprite, SpriteBuilder} from "./Sprite.js";',
  ];

  const fileText = `// \x40generated from makeAssets.js
${imports.filter(Boolean).join("\n")}

${lines.join("\n\n")}
`;

  writeFileSync("src/assets.js", fileText);
}

function processSpriteAtlas(info) {
  const { src, originX = 0, originY = 0 } = info;
  const folder = `./assets/${src}`;

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

  const name = info.name;

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
      ];

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
    bufferData.push(0, h, 0, x / size.w, y2 / size.h);
    bufferData.push(w, 0, 0, x2 / size.w, y / size.h);
    bufferData.push(w, h, 0, x2 / size.w, y2 / size.h);
  });

  let transform = BASE_TRANSFORM;

  // shift by origin
  // prettier-ignore
  transform = mult(transform, [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    -originX, -originY, 0, 1,
  ]);

  const result = {
    name,
    src: `${folder}/spritemap1.png`,
    bufferData,
    loops: info.loops,
    frameTime: allSameFrameTime
      ? firstFrame.holdFor / fps
      : frames.map((f) => f.holdFor / fps),
    perFrameData: null,
    frameElements: frames.map((f) => f.elements),
    transform,
  };

  return `/** @type {SpriteBuilder} */
export const make${name} = defineSprite(${printSimple(result)});`;
}

function processStaticSprite(info) {
  const src = `./assets/${readOrThrow(info, "src")}`;
  const name = readOrThrow(info, "name");

  const { width: w, height: h } = sizeOf(src);

  const { originX = w / 2, originY = h } = info;

  // prettier-ignore
  const bufferData = [
    0, 0, 0, 0, 0,
    0, h, 0, 0, 1,
    w, 0, 0, 1, 0,
    w, h, 0, 1, 1,
  ];

  let transform = BASE_TRANSFORM;

  // shift by origin
  // prettier-ignore
  transform = mult(transform, [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    -originX, -originY, 0, 1,
  ]);

  const result = {
    name,
    src,
    bufferData: () => `new Float32Array([${bufferData.join(",")}])`,
    loops: false,
    frameTime: 1,
    perFrameData: null,
    frameElements: [[{ i: 0, m: null }]],
    transform,
  };

  return `/** @type {SpriteBuilder} */
export const make${name} = defineSprite(${printSimple(result)});`;
}

/**
 *
 * @param {Object} info
 * @param {string} info.name
 * @param {string} info.src
 */
function processSound(info) {
  return `registerSound(${printSimple({
    name: info.name,
    src: `./assets/${info.src}`,
  })})`;
}

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

function mult(B, A) {
  // Multiply A and B... beautiful...
  return [
    A[0] * B[0] + A[1] * B[4] + A[2] * B[8] + A[3] * B[12],
    A[0] * B[1] + A[1] * B[5] + A[2] * B[9] + A[3] * B[13],
    A[0] * B[2] + A[1] * B[6] + A[2] * B[10] + A[3] * B[14],
    A[0] * B[3] + A[1] * B[7] + A[2] * B[11] + A[3] * B[15],
    A[4] * B[0] + A[5] * B[4] + A[6] * B[8] + A[7] * B[12],
    A[4] * B[1] + A[5] * B[5] + A[6] * B[9] + A[7] * B[13],
    A[4] * B[2] + A[5] * B[6] + A[6] * B[10] + A[7] * B[14],
    A[4] * B[3] + A[5] * B[7] + A[6] * B[11] + A[7] * B[15],
    A[8] * B[0] + A[9] * B[4] + A[10] * B[8] + A[11] * B[12],
    A[8] * B[1] + A[9] * B[5] + A[10] * B[9] + A[11] * B[13],
    A[8] * B[2] + A[9] * B[6] + A[10] * B[10] + A[11] * B[14],
    A[8] * B[3] + A[9] * B[7] + A[10] * B[11] + A[11] * B[15],
    A[12] * B[0] + A[13] * B[4] + A[14] * B[8] + A[15] * B[12],
    A[12] * B[1] + A[13] * B[5] + A[14] * B[9] + A[15] * B[13],
    A[12] * B[2] + A[13] * B[6] + A[14] * B[10] + A[15] * B[14],
    A[12] * B[3] + A[13] * B[7] + A[14] * B[11] + A[15] * B[15],
  ];
}

try {
  main();
} catch (error) {
  console.error(error);
}
