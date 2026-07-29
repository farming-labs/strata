import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
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
    const reactPackage = await realpath(
      new URL("../node_modules/react", import.meta.url),
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

    await writeFile(
      join(workspace, "package.json"),
      JSON.stringify({ name: "strata-e2e-consumer", private: true }, null, 2),
    );
    await runNpm(
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        tarball,
        `react@file:${reactPackage}`,
      ],
      { cwd: workspace },
    );

    const smokeTest = `
    import assert from "node:assert/strict";
    import React from "react";
    import { isRenderedFragment, render } from "@farming-labs/strata";
    import { StaticFragment } from "@farming-labs/strata/react-server";

    const rendered = render({
      type: "document",
      children: [
        {
          type: "element",
          tag: "section",
          attributes: { class: "intro" },
          children: [{ type: "text", value: "Fresh install <works>" }],
        },
      ],
    });

    assert.equal(
      rendered.html,
      '<section class="intro">Fresh install &lt;works&gt;</section>',
    );
    assert.equal(isRenderedFragment(rendered), true);

    const element = StaticFragment({ as: "section", content: rendered });
    assert.equal(element.type, "section");
    assert.equal(element.props["data-strata"], rendered.hash);
    assert.deepEqual(element.props.dangerouslySetInnerHTML, {
      __html: rendered.html,
    });
    assert.equal(React.isValidElement(element), true);
  `;

    const result = await run(
      process.execPath,
      ["--input-type=module", "--eval", smokeTest],
      { cwd: workspace },
    );
    assert.equal(result.stderr, "");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});
