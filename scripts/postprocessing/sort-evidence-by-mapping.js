#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

/**
 * Usage:
 *
 * node organize-evidence.js \
 *   ./map.json \
 *   ./evidence \
 *   ./organized-evidence
 */

const [, , mapFile, sourceDir, destRoot] = process.argv;

if (!mapFile || !sourceDir || !destRoot) {
  console.error(`
Usage:

node organize-evidence.js <map-file> <source-dir> <dest-dir>

Example:

node organize-evidence.js \
  ./cmmc-map.json \
  ./evidence \
  ./organized-evidence
`);

  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(mapFile, "utf8"));

/**
 * Sort requirement keys numerically:
 * 03.01.01 < 03.01.02 < 03.03.01
 */
const sortedRequirementKeys = Object.keys(data.byRequirements).sort((a, b) => {
  const ap = a.split(".").map(Number);
  const bp = b.split(".").map(Number);

  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const av = ap[i] || 0;
    const bv = bp[i] || 0;

    if (av !== bv) {
      return av - bv;
    }
  }

  return 0;
});

/**
 * Track how many times we've processed each artifact.
 * Multi-requirement artifacts get copied until the final occurrence,
 * where the original source file is moved.
 */
const processedCounts = new Map();

for (const requirement of sortedRequirementKeys) {
  const artifactIds = data.byRequirements[requirement];

  console.log(`\nProcessing ${requirement}`);

  for (const artifactId of artifactIds) {
    const artifact = data.artifacts[artifactId];

    if (!artifact) {
      console.warn(`  Missing artifact: ${artifactId}`);
      continue;
    }

    // Skip URLs
    if (artifact.type === "url") {
      console.log(`  [URL] Skipping ${artifact.filename}`);
      continue;
    }

    const requirementPath = requirement.replace(/\./g, "/");

    const destinationDir = path.join(destRoot, requirementPath);

    fs.mkdirSync(destinationDir, { recursive: true });

    const sourceFile = path.join(sourceDir, artifact.filename);
    const destinationFile = path.join(destinationDir, artifact.filename);

    if (!fs.existsSync(sourceFile)) {
      console.warn(`  Source missing: ${sourceFile}`);
      continue;
    }

    const totalRequirements = artifact.requirements.length;

    const currentCount = (processedCounts.get(artifact.id) || 0) + 1;

    processedCounts.set(artifact.id, currentCount);

    const isLastRequirement = currentCount === totalRequirements;

    // Single requirement => move
    if (totalRequirements === 1) {
      console.log(`  MOVE ${artifact.filename}`);
      console.log(`    -> ${destinationFile}`);

      fs.renameSync(sourceFile, destinationFile);
      continue;
    }

    // Multi requirement handling
    if (isLastRequirement) {
      console.log(`  FINAL MOVE ${artifact.filename}`);
      console.log(`    -> ${destinationFile}`);

      fs.renameSync(sourceFile, destinationFile);
    } else {
      console.log(`  COPY ${artifact.filename}`);
      console.log(`    -> ${destinationFile}`);

      fs.copyFileSync(sourceFile, destinationFile);
    }
  }
}

console.log("\nDone.");
