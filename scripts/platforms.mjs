export const platformSuffixByTarget = new Map([
  ["aarch64-apple-darwin", "darwin-arm64"],
  ["x86_64-apple-darwin", "darwin-x64"],
  ["x86_64-pc-windows-msvc", "win32-x64-msvc"],
  ["aarch64-pc-windows-msvc", "win32-arm64-msvc"],
  ["x86_64-unknown-linux-gnu", "linux-x64-gnu"],
  ["aarch64-unknown-linux-gnu", "linux-arm64-gnu"],
  ["x86_64-unknown-linux-musl", "linux-x64-musl"],
  ["aarch64-unknown-linux-musl", "linux-arm64-musl"],
]);

export function configuredPlatforms(packageJson) {
  const targets = packageJson.napi?.targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error("package.json must define at least one napi target");
  }

  return targets.map((target) => {
    const suffix = platformSuffixByTarget.get(target);
    if (!suffix) {
      throw new Error(`No release mapping exists for target ${target}`);
    }
    return {
      packageName: `${packageJson.name}-${suffix}`,
      suffix,
      target,
    };
  });
}
