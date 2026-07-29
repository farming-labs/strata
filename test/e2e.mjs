import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const root = new URL("..", import.meta.url);
const npmInvocation =
  process.platform === "win32"
    ? {
        args: [
          join(
            dirname(process.execPath),
            "node_modules",
            "npm",
            "bin",
            "npm-cli.js",
          ),
        ],
        command: process.execPath,
      }
    : { args: [], command: "npm" };

async function run(command, args, options = {}) {
  try {
    return await execFileAsync(command, args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      ...options,
    });
  } catch (error) {
    const output = [error.stdout, error.stderr].filter(Boolean).join("\n");
    error.message = `${error.message}\n${output}`;
    throw error;
  }
}

function runNpm(args, options) {
  return run(npmInvocation.command, [...npmInvocation.args, ...args], options);
}

test("packed package works in a fresh consumer project", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "strata-e2e-"));
  try {
    await cp(new URL("./fixtures/consumer", import.meta.url), workspace, {
      recursive: true,
    });

    const reactPackage = await realpath(
      new URL("../node_modules/react", import.meta.url),
    );
    const reactDomPackage = await realpath(
      new URL("../node_modules/react-dom", import.meta.url),
    );

    const { stdout } = await runNpm([
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      workspace,
    ]);
    const [{ filename, files, name }] = JSON.parse(stdout);
    assert.equal(name, "@farming-labs/strata");
    assert.equal(
      files.some(({ path }) => path === "index.js"),
      true,
      "packed package is missing its public entry point",
    );
    assert.equal(
      files.some(({ path }) => path === "react-server.js"),
      true,
      "packed package is missing its React Server Component entry point",
    );
    assert.equal(
      files.some(({ path }) => path.endsWith(".node")),
      true,
      "packed package is missing its native binding",
    );
    const tarball = join(workspace, filename);

    await runNpm(
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        tarball,
        `react@file:${reactPackage}`,
        `react-dom@file:${reactDomPackage}`,
      ],
      { cwd: workspace },
    );

    for (const consumer of ["esm-consumer.mjs", "cjs-consumer.cjs"]) {
      const result = await run(process.execPath, [consumer], {
        cwd: workspace,
      });
      assert.equal(result.stderr, "");
    }
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});
