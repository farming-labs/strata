import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { configuredPackageNames } from "./platforms.mjs";

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_INTERVAL_MS = 3_000;

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

export function expectedDistTag(version) {
  if (/^\d+\.\d+\.\d+$/.test(version)) {
    return "latest";
  }
  if (/^\d+\.\d+\.\d+-beta\.\d+$/.test(version)) {
    return "beta";
  }
  throw new Error(`Unsupported release version: ${version}`);
}

export function inspectPublication({ packageNames, packageMetadata, version }) {
  const distTag = expectedDistTag(version);
  const missingVersions = [];
  const incorrectDistTags = [];

  for (const packageName of packageNames) {
    const metadata = packageMetadata.get(packageName);
    if (!metadata?.versions?.[version]) {
      missingVersions.push(packageName);
      continue;
    }
    if (metadata["dist-tags"]?.[distTag] !== version) {
      incorrectDistTags.push(packageName);
    }
  }

  return {
    complete: missingVersions.length === 0 && incorrectDistTags.length === 0,
    distTag,
    incorrectDistTags,
    missingVersions,
  };
}

async function fetchPackageMetadata(packageNames) {
  const entries = await Promise.all(
    packageNames.map(async (packageName) => {
      const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
        { headers: { accept: "application/json" } },
      );

      if (response.status === 404) {
        return [packageName, null];
      }
      if (!response.ok) {
        throw new Error(
          `npm returned ${response.status} while checking ${packageName}`,
        );
      }
      return [packageName, await response.json()];
    }),
  );

  return new Map(entries);
}

export async function waitForPublication({
  packageNames,
  version,
  fetchMetadata = fetchPackageMetadata,
  intervalMs = DEFAULT_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  sleep = delay,
}) {
  const deadline = Date.now() + timeoutMs;
  let result;

  do {
    result = inspectPublication({
      packageNames,
      packageMetadata: await fetchMetadata(packageNames),
      version,
    });
    if (result.complete) {
      return result;
    }
    if (Date.now() < deadline) {
      await sleep(intervalMs);
    }
  } while (Date.now() < deadline);

  throw new Error(
    `npm publication did not become complete. Missing versions: ${
      result.missingVersions.join(", ") || "none"
    }. Incorrect ${result.distTag} dist-tags: ${
      result.incorrectDistTags.join(", ") || "none"
    }.`,
  );
}

async function main() {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const packageNames = configuredPackageNames(packageJson);
  const result = await waitForPublication({
    packageNames,
    version: packageJson.version,
  });

  console.log(
    `Verified ${packageJson.version} on npm for all ${packageNames.length} packages with the ${result.distTag} dist-tag.`,
  );
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  await main();
}
