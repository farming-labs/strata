import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedDistTag,
  inspectPublication,
  waitForPublication,
} from "../scripts/check-version-published.mjs";
import { selectReleaseRun, waitForReleaseRun } from "../scripts/release.mjs";

test("selects only the release run for the pushed tag and commit", () => {
  const expected = {
    databaseId: 3,
    headBranch: "v1.2.3",
    headSha: "release-sha",
  };
  const selected = selectReleaseRun(
    [
      { databaseId: 1, headBranch: "main", headSha: "release-sha" },
      { databaseId: 2, headBranch: "v1.2.2", headSha: "other-sha" },
      expected,
    ],
    { headSha: "release-sha", tag: "v1.2.3" },
  );

  assert.equal(selected, expected);
});

test("waits until the matching release workflow appears", async () => {
  let attempts = 0;
  const selected = await waitForReleaseRun({
    fetchRuns: async () => {
      attempts += 1;
      return attempts === 1
        ? []
        : [{ databaseId: 9, headBranch: "v1.2.3", headSha: "release-sha" }];
    },
    headSha: "release-sha",
    sleep: async () => {},
    tag: "v1.2.3",
    timeoutMs: 10_000,
  });

  assert.equal(attempts, 2);
  assert.equal(selected.databaseId, 9);
});

test("maps stable and beta versions to protected npm dist-tags", () => {
  assert.equal(expectedDistTag("1.2.3"), "latest");
  assert.equal(expectedDistTag("1.2.4-beta.2"), "beta");
  assert.throws(() => expectedDistTag("1.2.4-rc.1"), /Unsupported/);
});

test("requires every native package version and dist-tag", () => {
  const packageNames = ["@farming-labs/strata", "@farming-labs/strata-linux"];
  const packageMetadata = new Map([
    [
      packageNames[0],
      {
        "dist-tags": { latest: "1.2.3" },
        versions: { "1.2.3": {} },
      },
    ],
    [
      packageNames[1],
      {
        "dist-tags": { latest: "1.2.2" },
        versions: { "1.2.3": {} },
      },
    ],
  ]);

  const result = inspectPublication({
    packageMetadata,
    packageNames,
    version: "1.2.3",
  });

  assert.equal(result.complete, false);
  assert.deepEqual(result.missingVersions, []);
  assert.deepEqual(result.incorrectDistTags, [packageNames[1]]);
});

test("waits for npm registry propagation", async () => {
  const packageNames = ["@farming-labs/strata"];
  let attempts = 0;
  const result = await waitForPublication({
    fetchMetadata: async () => {
      attempts += 1;
      return new Map([
        [
          packageNames[0],
          attempts === 1
            ? null
            : {
                "dist-tags": { beta: "1.2.4-beta.1" },
                versions: { "1.2.4-beta.1": {} },
              },
        ],
      ]);
    },
    packageNames,
    sleep: async () => {},
    timeoutMs: 10_000,
    version: "1.2.4-beta.1",
  });

  assert.equal(attempts, 2);
  assert.equal(result.complete, true);
  assert.equal(result.distTag, "beta");
});
