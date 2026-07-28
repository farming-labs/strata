import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const packagePath = resolve(root, "package.json");
const cargoPath = resolve(root, "Cargo.toml");
const lockPath = resolve(root, "Cargo.lock");

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const { version } = packageJson;

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Unsupported package version: ${version}`);
}

const cargo = await readFile(cargoPath, "utf8");
const nextCargo = cargo.replace(
  /(\[package\][\s\S]*?\nversion = ")[^"]+(")/,
  `$1${version}$2`,
);
if (nextCargo === cargo && !cargo.includes(`version = "${version}"`)) {
  throw new Error("Could not update the package version in Cargo.toml");
}

const cargoLock = await readFile(lockPath, "utf8");
const nextCargoLock = cargoLock.replace(
  /(\[\[package\]\]\nname = "strata"\nversion = ")[^"]+(")/,
  `$1${version}$2`,
);
if (
  nextCargoLock === cargoLock &&
  !cargoLock.includes(`name = "strata"\nversion = "${version}"`)
) {
  throw new Error("Could not update the Strata version in Cargo.lock");
}

await Promise.all([
  writeFile(cargoPath, nextCargo),
  writeFile(lockPath, nextCargoLock),
]);

console.log(`Synchronized Cargo metadata to ${version}.`);
