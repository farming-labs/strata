import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { configuredPlatforms } from "./platforms.mjs";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const platforms = configuredPlatforms(packageJson);
const expectedRootFiles = new Set(
  platforms.map(({ suffix }) => `strata.${suffix}.node`),
);

for (const { suffix } of platforms) {
  const filename = `strata.${suffix}.node`;
  const paths = [
    resolve(filename),
    resolve("npm", suffix, filename),
    resolve("npm", suffix, "package.json"),
  ];

  for (const path of paths) {
    const metadata = await stat(path).catch(() => null);
    if (!metadata?.isFile() || metadata.size === 0) {
      throw new Error(`Missing or empty release artifact: ${path}`);
    }
  }
}

const actualRootFiles = new Set(
  (await readdir(".")).filter((filename) => filename.endsWith(".node")),
);
const missing = [...expectedRootFiles].filter(
  (filename) => !actualRootFiles.has(filename),
);
const unexpected = [...actualRootFiles].filter(
  (filename) => !expectedRootFiles.has(filename),
);

if (missing.length > 0 || unexpected.length > 0) {
  throw new Error(
    `Artifact mismatch. Missing: ${missing.join(", ") || "none"}. Unexpected: ${
      unexpected.join(", ") || "none"
    }.`,
  );
}

console.log(`Verified ${platforms.length} native release artifacts.`);
