'use strict';

const { readdirSync, existsSync } = require('fs');
const { join } = require('path');
const { execSync } = require('child_process');

function findNutFiles(dir, results = []) {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      findNutFiles(fullPath, results);
    } else if (entry.name.endsWith('.nut.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

const nutFiles = findNutFiles('.');

if (nutFiles.length === 0) {
  console.log('No NUT files found, skipping.');
  process.exit(0);
}

execSync('nyc mocha "**/*.nut.ts" --slow 4500 --timeout 600000 --parallel', {
  stdio: 'inherit',
  shell: true,
});
