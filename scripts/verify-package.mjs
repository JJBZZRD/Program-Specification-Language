import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const repoRoot = process.cwd();
  const packJsonPath = resolve(repoRoot, ".tmp", "pack.json");
  const smokeDir = resolve(repoRoot, ".tmp", "package-smoke");

  const packRaw = await readFile(packJsonPath, "utf8");
  const packEntries = JSON.parse(packRaw);

  if (!Array.isArray(packEntries) || packEntries.length === 0) {
    throw new Error("npm pack --json did not return a package descriptor.");
  }

  const packEntry = packEntries[0];
  if (!packEntry || typeof packEntry.filename !== "string") {
    throw new Error("npm pack --json output did not include a tarball filename.");
  }

  const fileSet = new Set((packEntry.files ?? []).map((file) => file.path));
  const requiredFiles = ["dist/index.js", "dist/index.d.ts"];
  const missingFiles = requiredFiles.filter((file) => !fileSet.has(file));

  if (missingFiles.length > 0) {
    throw new Error(`Packed tarball is missing expected files: ${missingFiles.join(", ")}`);
  }

  await rm(smokeDir, { recursive: true, force: true });
  await mkdir(smokeDir, { recursive: true });
  await rename(resolve(repoRoot, packEntry.filename), resolve(smokeDir, "package.tgz"));

  console.log("Pack manifest validated.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
