import { readFile } from "node:fs/promises";

import { configuredPlatforms } from "./platforms.mjs";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const packageNames = [
  packageJson.name,
  ...configuredPlatforms(packageJson).map(({ packageName }) => packageName),
];

const checks = await Promise.all(
  packageNames.map(async (packageName) => {
    const path = `${encodeURIComponent(packageName)}/${encodeURIComponent(packageJson.version)}`;
    const response = await fetch(`https://registry.npmjs.org/${path}`, {
      headers: { accept: "application/json" },
    });

    return {
      packageName,
      status: response.status,
    };
  }),
);

const published = checks.filter(({ status }) => status === 200);
if (published.length > 0) {
  throw new Error(
    `Version ${packageJson.version} already exists for: ${published
      .map(({ packageName }) => packageName)
      .join(", ")}`,
  );
}

const unexpected = checks.filter(
  ({ status }) => status !== 200 && status !== 404,
);
if (unexpected.length > 0) {
  throw new Error(
    `Could not verify npm availability: ${unexpected
      .map(({ packageName, status }) => `${packageName} (${status})`)
      .join(", ")}`,
  );
}

console.log(
  `Version ${packageJson.version} is unpublished for all ${packageNames.length} packages.`,
);
