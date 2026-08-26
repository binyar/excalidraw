import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const mjsFiles = execFileSync(
  "git",
  ["ls-files", "-co", "--exclude-standard", "--", "*.mjs"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter((filePath) => filePath && existsSync(filePath));

const disallowedFiles = mjsFiles.filter(
  (filePath) => !filePath.startsWith("scripts/"),
);

if (disallowedFiles.length > 0) {
  console.error(
    `Only scripts/ may contain .mjs files:\n${disallowedFiles
      .map((filePath) => `- ${filePath}`)
      .join("\n")}`,
  );
  process.exit(1);
}
