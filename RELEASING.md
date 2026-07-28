# Releasing Strata

Strata uses `bumpp` locally and GitHub Actions for multi-platform npm publishing. A release starts with one command, but npm publishing happens only after every native target builds and passes its runtime test.

## One-time npm setup

The first release needs an npm granular access token because npm trusted publishing can only be configured after a package exists.

1. Confirm the `farming-labs` npm organization exists and your account can publish public packages in it.
2. Add an `NPM_TOKEN` repository secret with permission to publish the root package and all `@farming-labs/strata-*` platform packages.
3. Merge the release workflow into `main`.
4. Run the first release.
5. On npm, configure GitHub Actions as the trusted publisher for the root and every platform package:

   - Organization: `farming-labs`
   - Repository: `strata`
   - Workflow filename: `release.yml`
   - Allowed action: npm publish

6. After trusted publishing succeeds, remove the long-lived `NPM_TOKEN` secret.

The workflow uses GitHub OIDC and publishes provenance. npm requires Node 22.14 or newer and npm 11.5.1 or newer for trusted publishing; the release job uses Node 24.

## Stable release

Start from a clean, synchronized `main` branch:

```sh
git switch main
git pull --ff-only
pnpm release:latest
```

This performs a patch bump, synchronizes `package.json`, `Cargo.toml`, and `Cargo.lock`, verifies that the version is unused on npm, runs the complete test suite, creates a `release: vX.Y.Z` commit and `vX.Y.Z` tag, then pushes both. The tag starts the release workflow, which publishes with the npm `latest` dist-tag.

## Beta release

```sh
git switch main
git pull --ff-only
pnpm release:beta
```

From a stable version, this creates the next patch prerelease, such as `0.1.1-beta.1`. From an existing beta it increments the prerelease number. The workflow publishes every package with the npm `beta` dist-tag.

## Safety properties

- Release commands refuse to run outside `main`.
- Local `main` must exactly match `origin/main`.
- The working tree must be clean.
- Cargo and npm versions must match the pushed tag.
- Existing npm versions are rejected before tagging and again in CI.
- Every configured native target must build and pass a runtime test.
- The root package is published only after all eight platform artifacts are present.
- Stable and beta versions cannot accidentally receive the wrong npm dist-tag.

Native multi-package publication is not atomic. If a release fails after some platform packages are published, do not reuse or rebuild the same version with different artifacts. Inspect the release run and continue with the unchanged artifacts.
