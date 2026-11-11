import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const output = "dist";
const paths = execFileSync("git", [
  "ls-files", "-z", "--", ".",
  ":(exclude)apps-script", ":(exclude)functions", ":(exclude)scripts",
  ":(exclude)package*.json", ":(exclude)README.md", ":(exclude).gitignore",
], { encoding: "utf8" }).split("\0").filter(Boolean);

rmSync(output, { force: true, recursive: true });
for (const path of paths) {
  const target = join(output, path);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(path, target);
}
