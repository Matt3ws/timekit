// Keeps the app version in step across package.json, tauri.conf.json,
// Cargo.toml and Cargo.lock.
//
//   node scripts/version.mjs 0.2.0   bump every file to 0.2.0
//   node scripts/version.mjs --check fail unless all files agree and
//                                    CHANGELOG.md has a "## <version>" section
import { readFileSync, writeFileSync } from "node:fs";

const files = {
  "package.json": /("version":\s*")([^"]+)(")/,
  "src-tauri/tauri.conf.json": /("version":\s*")([^"]+)(")/,
  "src-tauri/Cargo.toml": /(\[package\]\nname = "timekit"\nversion = ")([^"]+)(")/,
  "src-tauri/Cargo.lock": /(\nname = "timekit"\nversion = ")([^"]+)(")/,
};

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const versionOf = (path, pattern) => {
  const match = read(path).match(pattern);
  if (!match) throw new Error(`No version found in ${path}`);
  return match[2];
};

const arg = process.argv[2];

if (arg === "--check") {
  const versions = Object.entries(files).map(([path, pattern]) => [path, versionOf(path, pattern)]);
  const version = versions[0][1];
  const mismatched = versions.filter(([, v]) => v !== version);
  if (mismatched.length) {
    console.error(`Versions differ: ${versions.map(([p, v]) => `${p}=${v}`).join(", ")}`);
    console.error("Run `pnpm bump <version>` to set them all.");
    process.exit(1);
  }
  if (!read("CHANGELOG.md").split("\n").includes(`## ${version}`)) {
    console.error(`CHANGELOG.md has no "## ${version}" section`);
    process.exit(1);
  }
  console.log(`Version ${version}: all files agree, CHANGELOG.md has its section`);
} else if (/^\d+\.\d+\.\d+$/.test(arg ?? "")) {
  for (const [path, pattern] of Object.entries(files)) {
    const url = new URL(`../${path}`, import.meta.url);
    writeFileSync(url, read(path).replace(pattern, `$1${arg}$3`));
  }
  console.log(`Bumped to ${arg}. Add a "## ${arg}" section to CHANGELOG.md.`);
} else {
  console.error("Usage: node scripts/version.mjs <x.y.z> | --check");
  process.exit(1);
}
