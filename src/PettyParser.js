let activeValue = undefined;
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
      activeValue = JSON.parse(json);
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
 * @param {function(?):T} code
 * @returns {T}
 */
export function processKey(key, code) {
  if (!hasKey(key)) {
    throw `is missing "${key}"`;
  }

  const prev = activeValue;

  activePath.push(key);
  activeValue = activeValue[key];

  const result = code(activeValue);

  activePath.pop();
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
 * Validator returns falsy on success, or an error string
 * @param {string} key
 * @param {function(string):?string} validator
 */
export function validateString(key, validator) {
  return processKey(key, (val) => {
    if (typeof val !== "string") {
      throw "is supposed to be text";
    }

    const error = validator(val);
    if (error) throw error;

    return val;
  });
}

/**
 * @template T
 * @param {string} key
 * @param {!Array<T>} values - the possible values
 * @returns {T}
 */
export function readOneOf(key, values) {
  return processKey(key, (val) => {
    if (!values.includes(val)) {
      const serial = values.map((v) => JSON.stringify(v));

      if (values.length === 1) {
        throw `must be ${serial[0]}`;
      } else if (values.length === 2) {
        throw `must be either ${serial[0]} or ${serial[1]}`;
      } else {
        throw `must be one of ${serial.slice(-1).join(", ")}, or ${
          serial[serial.length - 1]
        }`;
      }
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
export function readNum(
  key,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  maxIsInclusive = false
) {
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
 * @param {function(?,string):T} code
 * @returns {!Map<string, T>}
 */
export function processMap(key, code) {
  return processKey(key, (raw) => {
    if (raw == null || typeof raw !== "object") {
      throw `is supposed to be a mapping`;
    }

    const map = new Map();
    // this raw check is for closure, but its checked above as well
    raw &&
      Object.keys(raw).forEach((innerKey) => {
        map.set(
          innerKey,
          processKey(innerKey, (val) => code(val, innerKey))
        );
      });

    return map;
  });
}

/**
 * @template T
 * @param {string} key
 * @param {function(?,number):T} code
 * @returns {!Array<T>}
 */
export function processArray(key, code) {
  return processKey(key, (raw) => {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw)) {
      throw `is supposed to be a list`;
    }

    return raw.map((val, index) => code(val, index));
  });
}

/**
 * @template T
 * @param {string} key
 * @param {function(number):T} code
 * @returns {!Array<T>}
 */
export function processObjectArray(key, code) {
  return processKey(key, (raw) => {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw)) {
      throw `is supposed to be a list`;
    }

    const prev = activeValue;
    const results = raw.map((val, index) => {
      activeValue = val;
      activePath.push(index);
      const result = code(val, index);
      activePath.pop();
      return result;
    });
    activeValue = prev;

    return results;
  });
}

function assertIsParsing() {
  if (activePath == null) {
    throw new Error("PettyParser code called outside of parseRawObject");
  }
}
