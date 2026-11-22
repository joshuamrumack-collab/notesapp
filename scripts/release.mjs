// Usage: npm run release 0.2.0
// Sets the version everywhere, commits, tags and pushes. GitHub then builds the installer and publishes the update.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Give a version like: npm run release 0.2.0");
  process.exit(1);
}
const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, "utf8")));
edit("package.json", (s) => s.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`));
edit("src-tauri/tauri.conf.json", (s) => s.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`));
edit("src-tauri/Cargo.toml", (s) => s.replace(/^version = "[^"]+"/m, `version = "${version}"`));
const run = (cmd) => execSync(cmd, { stdio: "inherit" });
run("git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml");
run(`git commit -m "Release ${version}"`);
run(`git tag v${version}`);
run("git push");
run(`git push origin v${version}`);
console.log(`\nPushed v${version}. GitHub is building it now; the release appears in a few minutes.`);
