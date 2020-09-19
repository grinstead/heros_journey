import svgMesh3d from "svg-mesh-3d";
import { readFileSync, writeFileSync } from "fs";
import { bufferToHex, hexToBuffer } from "../src/hex.js";

function main() {
  const data = readFileSync("assets/Heros Journey Test 2.svg", "utf8");

  const match = /<path d="([^"]+)"/.exec(data);
  const path = match[1];

  const { positions, cells } = svgMesh3d(path, { normalize: false, scale: 1 });

  const posData = new Float32Array(3 * positions.length);
  positions.forEach(([x, y, z], i) => {
    posData[3 * i] = x;
    posData[3 * i + 1] = y;
    posData[3 * i + 2] = z;
  });

  const ensureUint16 = (value) => {
    if (value < 0 || value >= 1 << 16) {
      throw new Error(`out-of-bounds cell: ${value}`);
    }
    return value;
  };

  const indexData = new Uint16Array(3 * cells.length);
  cells.forEach(([p1, p2, p3], i) => {
    indexData[3 * i] = ensureUint16(p1);
    indexData[3 * i + 1] = ensureUint16(p2);
    indexData[3 * i + 2] = ensureUint16(p3);
  });

  const object = `{
    positions: "${bufferToHex(posData.buffer)}",
    cells: "${bufferToHex(indexData.buffer)}",
  }`;

  console.log(object);
}

main();
