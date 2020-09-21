let activeValue = undefined;
let activePath = null;

/**
 * Allows for very pedantic parsing of json using the functions in this module.
 * @template T
 * @param {string} json
 * @param {function():T} code
 */
export function parseRawObject(value, code) {
  const prevValue = activeValue;
  const prevPath = activePath;

  try {
    try {
      activeValue = JSON.parse(value);
    } catch (error) {
      throw "content is not valid json";
    }

    activePath = [];

    try {
      return code();
    } catch (error) {
      if (typeof error === "string") {
        const path = activePath.length ? activePath.join("/") : "object";

        throw `${path} ${error}`;
      } else {
        throw error;
      }
    }
  } finally {
    activeValue = prevValue;
    activePath = prevPath;
  }
}

/**
 * @template T
 * @param {string} key
 * @param {function(?):T}
 * @returns T
 */
export function processKey(key, code) {
  assertIsParsing();

  if (
    !activeValue ||
    typeof activeValue !== "object" ||
    Array.isArray(activeValue)
  ) {
    throw `is supposed to be an object`;
  }

  if (!activeValue.hasOwnProperty(key)) {
    throw `is missing "${key}"`;
  }

  const prev = activeValue;

  activePath.push(key);
  activeValue = activeValue[key];

  const result = code(activeValue);

  activeValue = prev;

  return result;
}

/**
 * @param {string} key
 * @returns {string}
 */
export function readString(key) {
  return processKey(key, (val) => {
    if (typeof val !== "string") {
      throw "is supposed to be text";
    }

    return val;
  });
}

/**
 * @param {string} key
 * @param {number} min
 * @param {number} max
 * @param {boolean} maxIsInclusive
 * @returns {number}
 */
export function readNum(key, min, max, maxIsInclusive) {
  return processKey(key, (val) => {
    if (typeof val !== "number") {
      throw "is supposed to be a number";
    }

    if (val < min || max < val) {
      throw `must be between ${min} and ${max}`;
    } else if (!maxIsInclusive && max === val) {
      throw `must be below ${max}`;
    }

    return val;
  });
}

/**
 * @template T
 * @param {string} key
 * @param {function(?,string):T}
 * @returns {!Map<string, T>}
 */
export function processMap(key, code) {
  return processKey(key, (raw) => {
    if (!raw || typeof raw !== "object") {
      throw `is supposed to be a mapping`;
    }

    const map = new Map();
    Object.keys(raw).forEach((key) => {
      map.set(
        key,
        processKey(key, (val) => code(val, name))
      );
    });

    return map;
  });
}

/**
 * @template T
 * @param {string} key
 * @param {function(?,number):T}
 * @returns {!Array<T>}
 */
export function processArray(key, code) {
  return processKey(key, (raw) => {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw)) {
      throw `is supposed to be a list`;
    }

    return raw.map((val, index) => {
      activePath.push(index);
      const result = code(val, index);
      activePath.pop();
      return result;
    });
  });
}

function assertIsParsing() {
  if (activePath == null) {
    throw new Error("PettyParser code called outside of parseRawObject");
  }
}
