const HEX_CHARS = "0123456789abcdef".split("").map((c) => c.charCodeAt(0));
const CHAR_0 = 48; // "0".charCodeAt(0);
const CHAR_A = 65; // "A".charCodeAt(0);
const CHAR_a = 97; // "a".charCodeAt(0);

/**
 * Converts a given buffer to a lower-case hex string
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function bufferToHex(buffer) {
  return bytesToHex(new Uint8Array(buffer));
}

/**
 * Converts a given set of bytes to a lower-case hex string
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToHex(bytes) {
  const hexParts = [[]];
  let hexPart = hexParts[0];

  const length = bytes.length;
  for (let i = 0; i < length; i++) {
    const byte = bytes[i];

    hexPart.push(HEX_CHARS[byte >> 4]);
    const partLength = hexPart.push(HEX_CHARS[byte & 0xf]);

    // do not let each part get too big
    if (partLength >= 10000) {
      hexParts.push((hexPart = []));
    }
  }

  return hexParts
    .map((part) => String.fromCharCode.apply(String, part))
    .join("");
}

/**
 * Creates and ArrayBuffer from hex data
 * @param {string} hex The hex string to convert
 * @returns {ArrayBuffer}
 */
export function hexToBuffer(hex) {
  const length = hex.length / 2;
  if ((length | 0) !== length) {
    throw new Error(`Given hex of odd length: ${hex.length}`);
  }

  const bytes = new Uint8Array(length);
  for (let i = 0, j = 0; i < length; ++i) {
    bytes[i] =
      (hexCharDecimalValue(hex.charCodeAt(2 * i)) << 4) |
      hexCharDecimalValue(hex.charCodeAt(2 * i + 1));
  }

  return bytes.buffer;
}

/**
 * Returns the numeric value that charCode represents.
 * @param {number} charCode The ascii value of the character to test. This is assumed to be one of 0-9, A-F, or a-f, the code is wrong if given bad inputs
 * @returns {number}
 */
export function hexCharDecimalValue(charCode) {
  if (charCode < CHAR_A) {
    return charCode - CHAR_0;
  } else if (charCode < CHAR_a) {
    return charCode - CHAR_A + 10;
  } else {
    return charCode - CHAR_a + 10;
  }
}
