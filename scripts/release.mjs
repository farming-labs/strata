import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RELEASE_WORKFLOW = "release.yml";
const WORKFLOW_DISCOVERY_TIMEOUT_MS = 120_000;
const WORKFLOW_DISCOVERY_INTERVAL_MS = 2_000;

const releaseModes = {
  beta: {
    bumpArguments: ["--release", "prerelease", "--preid", "beta"],
  },
  latest: {
    bumpArguments: ["--release", "patch"],
  },
};

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function executable(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function run(command, arguments_, { capture = false } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, arguments_, {
      encoding: "utf8",
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.on("error", rejectRun);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolveRun(stdout.trim());
        return;
      }
      const detail = capture && stderr.trim() ? `\n${stderr.trim()}` : "";
      rejectRun(
        new Error(
          `${command} ${arguments_.join(" ")} failed with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }.${detail}`,
        ),
      );
    });
  });
}

function repositoryName(packageJson) {
  const repositoryUrl =
    typeof packageJson.repository === "string"
      ? packageJson.repository
      : packageJson.repository?.url;
  if (!repositoryUrl) {
    throw new Error("package.json must define a GitHub repository URL");
  }

  const url = new URL(repositoryUrl.replace(/^git\+/, ""));
  if (url.hostname !== "github.com") {
    throw new Error(`Expected a GitHub repository, received ${url.hostname}`);
  }
  return url.pathname.replace(/^\/|\.git$/g, "");
}

export function selectReleaseRun(runs, { headSha, tag }) {
  return runs.find(
    (runEntry) => runEntry.headSha === headSha && runEntry.headBranch === tag,
  );
}

export async function waitForReleaseRun({
  fetchRuns,
  headSha,
  intervalMs = WORKFLOW_DISCOVERY_INTERVAL_MS,
  sleep = delay,
  tag,
  timeoutMs = WORKFLOW_DISCOVERY_TIMEOUT_MS,
}) {
  const deadline = Date.now() + timeoutMs;

  do {
    const runEntry = selectReleaseRun(await fetchRuns(), { headSha, tag });
    if (runEntry) {
      return runEntry;
    }
    if (Date.now() < deadline) {
      await sleep(intervalMs);
    }
  } while (Date.now() < deadline);

  throw new Error(
    `GitHub did not create the ${RELEASE_WORKFLOW} run for ${tag} within ${
      timeoutMs / 1000
    } seconds.`,
  );
}

async function listRuns(repository, additionalArguments = []) {
  const output = await run(
    "gh",
    [
      "run",
      "list",
      "--repo",
      repository,
      "--workflow",
      RELEASE_WORKFLOW,
      "--limit",
      "20",
      "--json",
      "databaseId,headBranch,headSha,status,conclusion,url",
      ...additionalArguments,
    ],
    { capture: true },
  );
  return JSON.parse(output);
}

async function assertInitialPublishAuthentication(repository, packageName) {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
    { headers: { accept: "application/json" } },
  );
  if (response.ok) {
    return;
  }
  if (response.status !== 404) {
    throw new Error(
      `npm returned ${response.status} while checking ${packageName}`,
    );
  }

  const secrets = JSON.parse(
    await run(
      "gh",
      ["secret", "list", "--repo", repository, "--json", "name"],
      { capture: true },
    ),
  );
  if (!secrets.some(({ name }) => name === "NPM_TOKEN")) {
    throw new Error(
      `The first npm publication requires an NPM_TOKEN Actions secret in ${repository}. Add it before creating a release tag.`,
    );
  }
}

async function assertReleaseEnvironment(repository, packageName) {
  await run("gh", ["auth", "status", "--hostname", "github.com"], {
    capture: true,
  });
  await run(
    "gh",
    ["workflow", "view", RELEASE_WORKFLOW, "--repo", repository],
    { capture: true },
  );

  const activeRuns = (await listRuns(repository)).filter(
    ({ status }) => status !== "completed",
  );
  if (activeRuns.length > 0) {
    throw new Error(
      `Another release is still active: ${activeRuns
        .map(({ headBranch, url }) => `${headBranch} (${url})`)
        .join(", ")}`,
    );
  }

  await assertInitialPublishAuthentication(repository, packageName);
}

async function main() {
  const modeName = process.argv[2];
  const mode = releaseModes[modeName];
  if (!mode) {
    throw new Error("Expected release mode latest or beta");
  }

  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const repository = repositoryName(packageJson);

  await run(process.execPath, ["scripts/release-preflight.mjs"]);
  await assertReleaseEnvironment(repository, packageJson.name);

  await run(executable("pnpm"), [
    "exec",
    "bumpp",
    "package.json",
    "--all",
    ...mode.bumpArguments,
    "--commit",
    "release: {tag}",
    "--tag",
    "v{version}",
    "--execute",
    "pnpm release:prepare",
  ]);

  const releasedPackageJson = JSON.parse(
    await readFile("package.json", "utf8"),
  );
  const tag = `v${releasedPackageJson.version}`;
  let releaseUrl = `the ${RELEASE_WORKFLOW} workflow for ${tag}`;
  try {
    const headSha = await run("git", ["rev-parse", "HEAD"], { capture: true });
    const taggedSha = await run("git", ["rev-parse", `${tag}^{commit}`], {
      capture: true,
    });
    if (headSha !== taggedSha) {
      throw new Error(`${tag} does not point to the release commit ${headSha}`);
    }

    const releaseRun = await waitForReleaseRun({
      fetchRuns: () =>
        listRuns(repository, ["--event", "push", "--commit", headSha]),
      headSha,
      tag,
    });
    releaseUrl = releaseRun.url;

    console.log(`Watching npm release: ${releaseUrl}`);
    await run("gh", [
      "run",
      "watch",
      String(releaseRun.databaseId),
      "--repo",
      repository,
      "--exit-status",
    ]);
    await run(process.execPath, ["scripts/check-version-published.mjs"]);
  } catch (error) {
    console.error(
      `${tag} was created, but npm publication did not complete. Do not create another version. Inspect or rerun ${releaseUrl}.`,
    );
    throw error;
  }

  console.log(
    `Release ${tag} is complete: every native package is available on npm.`,
  );
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
