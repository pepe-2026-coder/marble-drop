/* Syntax-check every JavaScript source file without executing it. */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const entries = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(m?js)$/.test(name)) entries.push(path);
  }
}
walk(resolve(root, "src"));
walk(resolve(root, "scripts"));
for (const file of entries) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
  console.log(`ok ${relative(root, file)}`);
}
