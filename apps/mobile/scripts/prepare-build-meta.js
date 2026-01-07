#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ensureDir = (targetDir) => {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
};

const outputDir = path.join(__dirname, '..', '.generated');
ensureDir(outputDir);

const timestamp = Date.now();
const iosBuildNumber = String(timestamp);
const androidVersionCode = Math.max(1, Math.floor(timestamp / 1000));

const meta = {
  iosBuildNumber,
  androidVersionCode,
};

const outputPath = path.join(outputDir, 'build-meta.json');
fs.writeFileSync(outputPath, JSON.stringify(meta, null, 2));

console.log('[build-meta] ios=%s android=%s -> %s', iosBuildNumber, androidVersionCode, outputPath);
