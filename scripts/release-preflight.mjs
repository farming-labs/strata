import { execFileSync } from "node:child_process";

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

const branch = git(["branch", "--show-current"]);
if (branch !== "main") {
  throw new Error(
    `Releases must start from main. The current branch is ${branch || "detached"}.`,
  );
}

const status = git(["status", "--porcelain"]);
if (status) {
  throw new Error("The working tree must be clean before starting a release.");
}

git(["fetch", "--quiet", "origin", "main"]);

const localHead = git(["rev-parse", "HEAD"]);
const remoteHead = git(["rev-parse", "origin/main"]);
if (localHead !== remoteHead) {
  throw new Error(
    "Local main must exactly match origin/main before starting a release.",
  );
}

console.log("Release preflight passed: main is clean and synchronized.");
