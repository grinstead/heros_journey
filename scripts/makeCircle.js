import svgMesh3d from "svg-mesh-3d";
import { readFileSync, writeFileSync } from "fs";

function main() {
  const data = readFileSync("assets/Heros Journey Test 2.svg", "utf8");

  const match = /<path d="([^"]+)"/.exec(data);
  const path = match[1];

  const mesh = svgMesh3d(path, { normalize: false, scale: 100 });

  console.log(mesh);
}

main();
