import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Vector sources are authoritative; raster variants are committed for static hosts.
const logo = await readFile("public/brand/logo.svg");
const pngs = await Promise.all(
  [16, 32, 48].map((size) => sharp(logo).resize(size, size).png().toBuffer()),
);
const directory = Buffer.alloc(6 + 16 * pngs.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(pngs.length, 4);
let offset = directory.length;
pngs.forEach((png, index) => {
  const entry = 6 + index * 16;
  directory[entry] = directory[entry + 1] = [16, 32, 48][index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(png.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile("public/favicon.ico", Buffer.concat([directory, ...pngs]));
const apple = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="#ffffff"/><svg x="30" y="30" width="120" height="120" viewBox="0 0 32 32" fill="none">${logo
  .toString()
  .match(/<g[\s\S]*<\/g>/)[0]
  .replace('stroke="currentColor"', 'stroke="#334d3f"')}</svg></svg>`;
await sharp(Buffer.from(apple)).png().toFile("public/apple-touch-icon.png");
await sharp("public/brand/social-card.svg")
  .png()
  .toFile("public/brand/social-card.png");
console.log(
  "Generated favicon (16/32/48), Apple touch icon and 1200×630 social card.",
);
