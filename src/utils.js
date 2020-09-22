/**
 * Returns the angle given the opposite and adjacent sides. If both are 0, then the angle 0 is returned.
 * @param {number} opposite - The "opposite" side of the triangle (most likely, the y difference)
 * @param {number} adjacent - The "adjacent" side of the triangle (most likely, the x difference)
 * @returns {number} The angle
 */
export function arctan(opposite, adjacent) {
  if (adjacent > 0) {
    return Math.atan(opposite / adjacent);
  } else if (adjacent === 0) {
    if (opposite > 0) {
      return Math.PI / 2;
    } else if (opposite === 0) {
      return 0; // dunno what is best here
    } else {
      return -Math.PI / 2;
    }
  } else {
    return Math.atan(opposite / adjacent) + Math.PI;
  }
}

/**
 * Calculates the distance
 * @param {number} dx
 * @param {number} dy
 * @param {number} dz
 */
export function magnitudeOf(dx, dy, dz) {
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
