const INVALID_CALL = {};

/** @type {!Object} */
let activeValue = INVALID_CALL;
let activePath = null;

/**
 * Allows for very pedantic parsing of json using the functions in this module.
 * @template T
 * @param {string} json
 * @param {function():T} code
 */
export function parseRawObject(json, code) {
  const prevValue = activeValue;
  const prevPath = activePath;

  try {
    try {
      const obj = JSON.parse(json);
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        throw "content is not a plain object";
      }
      activeValue = obj;
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
 * @param {string} key
 * @returns {boolean}
 */
export function hasKey(key) {
  assertIsParsing();

  if (
    !activeValue ||
    typeof activeValue !== "object" ||
    Array.isArray(activeValue)
  ) {
    throw `is supposed to be an object`;
  }

  return activeValue.hasOwnProperty(key);
}

/**
 * @template T
 * @param {string} key
 * @param {function():T} code
 * @returns {T}
 */
export function processKey(key, code) {
  return processKeyWithValidator(
    key,
    (val) =>
      (!val || typeof val !== "object" || Array.isArray(val)) &&
      "is supposed to be an object",
    code
  );
}

/**
 * @template T
 * @param {string} key
 * @param {function(?):(boolean|string)} validator
 * @param {function():T} code
 * @returns {T}
 */
function processKeyWithValidator(key, validator, code) {
  if (!hasKey(key)) {
    throw `is missing "${key}"`;
  }

  const prev = activeValue;

  activePath.push(key);
  const next = activeValue[key];
  const error = validator(next);
  if (error) throw error;

  activeValue = next;

  const result = code();

  activePath.pop();
  activeValue = prev;

  return result;
}

/**
 * Validator returns falsy on success, or an error string
 * @param {string} key
 * @param {function(?):(boolean|string)} validator
 * @returns {?}
 */
export function validateKey(key, validator) {
  if (!hasKey(key)) {
    throw `is missing "${key}"`;
  }

  const prev = activeValue;
  const value = prev[key];

  activePath.push(key);
  activeValue = INVALID_CALL;

  const error = validator(value);
  if (error) throw error;

  activePath.pop();
  activeValue = prev;

  return value;
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function readBoolean(key) {
  return validateKey(
    key,
    (val) => typeof val !== "boolean" && "is supposed to be true or false"
  );
}

/**
 * @param {string} key
 * @returns {string}
 */
export function readString(key) {
  return validateKey(
    key,
    (val) => typeof val !== "string" && "is supposed to be text"
  );
}

/**
 * Validator returns falsy on success, or an error string
 * @param {string} key
 * @param {function(string):(boolean|string)} validator
 * @returns {string}
 */
export function validateString(key, validator) {
  return validateKey(key, (val) => {
    if (typeof val !== "string") {
      return "is supposed to be text";
    }
    return validator(val);
  });
}

/**
 * @template T
 * @param {string} key
 * @param {!Array<T>} values - the possible values
 * @returns {T}
 */
export function readOneOf(key, values) {
  return validateKey(key, (val) => {
    if (!values.includes(val)) {
      const serial = values.map((v) => JSON.stringify(v));

      if (serial.length === 1) {
        return `must be ${serial[0]}`;
      } else if (serial.length === 2) {
        return `must be either ${serial[0]} or ${serial[1]}`;
      } else {
        return `must be one of ${serial.slice(0, -1).join(", ")}, or ${
          serial[serial.length - 1]
        }`;
      }
    }

    return false;
  });
}

/**
 * @param {string} key
 * @param {number} min
 * @param {number} max
 * @param {boolean} maxIsInclusive
 * @returns {number}
 */
export function readNum(
  key,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  maxIsInclusive = false
) {
  return validateKey(key, (val) => {
    if (typeof val !== "number") {
      return "is supposed to be a number";
    }

    if (val < min || max < val) {
      return `must be between ${min} and ${max}`;
    } else if (!maxIsInclusive && max === val) {
      return `must be below ${max}`;
    }

    return false;
  });
}

/**
 * @template T
 * @param {string} key
 * @param {function(string):T} code
 * @returns {!Map<string, T>}
 */
export function processObjectMap(key, code) {
  return processKeyWithValidator(
    key,
    (val) =>
      (!val || typeof val !== "object" || Array.isArray(val)) &&
      "is supposed to be a mapping",
    () => {
      const map = new Map();

      Object.keys(activeValue).forEach((innerKey) => {
        map.set(
          innerKey,
          processKey(innerKey, () => code(innerKey))
        );
      });

      return map;
    }
  );
}

/**
 * @template T
 * @param {string} key
 * @param {function(?,number):T} code
 * @returns {!Array<T>}
 */
export function processArray(key, code) {
  return processKeyWithValidator(
    key,
    (val) => !Array.isArray(val) && "is supposed to be a list",
    () => {
      const pathIndex = activePath.length;
      activePath.push(0);

      const results = activeValue.map((val, index) => {
        activePath[pathIndex] = index;
        return code(val, index);
      });

      activePath.pop();
      return results;
    }
  );
}

/**
 * @template T
 * @param {string} key
 * @param {function(number):T} code
 * @returns {!Array<T>}
 */
export function processObjectArray(key, code) {
  return processArray(key, (val, index) => {
    if (!val || typeof val !== "object" || Array.isArray(val)) {
      throw "is supposed to be an object";
    }

    const prev = activeValue;
    activeValue = val;
    const result = code(index);
    activeValue = prev;
    return result;
  });
}

function assertIsParsing() {
  if (activePath == null) {
    throw new Error("PettyParser code called outside of parseRawObject");
  }

  if (activeValue === INVALID_CALL) {
    throw new Error("PettyParser code called inside a validator");
  }
}
