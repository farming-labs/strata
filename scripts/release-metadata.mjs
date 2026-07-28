import { readFile } from "node:fs/promises";

const tag = process.argv[2];
if (!tag) {
  throw new Error("Expected the release tag as the first argument");
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const cargo = await readFile("Cargo.toml", "utf8");
const cargoLock = await readFile("Cargo.lock", "utf8");
const { version } = packageJson;

if (tag !== `v${version}`) {
  throw new Error(`Tag ${tag} does not match package version ${version}`);
}
if (!cargo.includes(`version = "${version}"`)) {
  throw new Error(`Cargo.toml is not synchronized to ${version}`);
}
if (!cargoLock.includes(`name = "strata"\nversion = "${version}"`)) {
  throw new Error(`Cargo.lock is not synchronized to ${version}`);
}

let distTag;
if (/^\d+\.\d+\.\d+$/.test(version)) {
  distTag = "latest";
} else if (/^\d+\.\d+\.\d+-beta\.\d+$/.test(version)) {
  distTag = "beta";
} else {
  throw new Error(
    `Version ${version} is neither a stable nor supported beta release`,
  );
}

console.log(`version=${version}`);
console.log(`dist-tag=${distTag}`);
