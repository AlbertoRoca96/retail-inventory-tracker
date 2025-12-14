#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const versionPath = resolve(__dirname, '../version.json');

const usage = `Usage: node scripts/bump-version.mjs [ios|android|both] [options]

Options:
  ios | android | both   Which platform build number(s) to increment. Defaults to both.
  --set-version <value>  Override the marketing version (e.g., 1.0.1).
  --set-ios <value>      Force the iOS build number instead of incrementing.
  --set-android <value>  Force the Android versionCode instead of incrementing.
  --dry-run              Print the result without writing to disk.
`;

const args = process.argv.slice(2);
let target = 'both';
let setVersion;
let setIos;
let setAndroid;
let dryRun = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  switch (arg) {
    case 'ios':
    case 'android':
    case 'both':
      target = arg;
      break;
    case '--set-version':
      setVersion = args[++i];
      break;
    case '--set-ios':
      setIos = Number(args[++i]);
      break;
    case '--set-android':
      setAndroid = Number(args[++i]);
      break;
    case '--dry-run':
      dryRun = true;
      break;
    case '--help':
    case '-h':
      console.log(usage);
      process.exit(0);
    default:
      console.error(`Unknown argument: ${arg}\n`);
      console.log(usage);
      process.exit(1);
  }
}

const versionData = JSON.parse(readFileSync(versionPath, 'utf8'));

const next = { ...versionData };
if (setVersion) next.version = setVersion;

const shouldBumpIos = target === 'ios' || target === 'both';
const shouldBumpAndroid = target === 'android' || target === 'both';

if (setIos != null) {
  if (Number.isNaN(setIos)) {
    console.error('Invalid value for --set-ios.');
    process.exit(1);
  }
  next.iosBuildNumber = setIos;
} else if (shouldBumpIos) {
  next.iosBuildNumber = Number(next.iosBuildNumber ?? 0) + 1;
}

if (setAndroid != null) {
  if (Number.isNaN(setAndroid)) {
    console.error('Invalid value for --set-android.');
    process.exit(1);
  }
  next.androidVersionCode = setAndroid;
} else if (shouldBumpAndroid) {
  next.androidVersionCode = Number(next.androidVersionCode ?? 0) + 1;
}

const output = JSON.stringify(next, null, 2) + '\n';

if (dryRun) {
  console.log('[dry-run] Updated version config would be:\n');
  console.log(output);
  process.exit(0);
}

writeFileSync(versionPath, output);

console.log('Updated version metadata:');
console.table({
  version: next.version,
  iosBuildNumber: next.iosBuildNumber,
  androidVersionCode: next.androidVersionCode,
});
