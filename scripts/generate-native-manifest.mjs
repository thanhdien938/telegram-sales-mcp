#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));

const args = process.argv.slice(2);
let dllPath = undefined;
let commit = 'a'.repeat(40); // default placeholder 40-char hash if unspecified
let outDir = join(root, 'native');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dll' && args[i + 1]) {
    dllPath = resolve(args[i + 1]);
    i++;
  } else if (args[i] === '--commit' && args[i + 1]) {
    commit = args[i + 1];
    i++;
  } else if (args[i] === '--out' && args[i + 1]) {
    outDir = resolve(args[i + 1]);
    i++;
  } else if (args[i] === '--help') {
    process.stdout.write(
      'Usage: node scripts/generate-native-manifest.mjs --dll <PATH_TO_TDJSON_DLL> [--commit <40_HEX_COMMIT>] [--out <OUTPUT_DIR>]\n' +
      'Generates a schema 1 native manifest matching the built tdjson.dll for Windows x64.\n'
    );
    process.exit(0);
  }
}

if (!dllPath) {
  // Check if tdjson.dll is already in outDir
  const candidate = join(outDir, 'tdjson.dll');
  if (existsSync(candidate)) {
    dllPath = candidate;
  } else {
    process.stderr.write('Error: --dll <PATH_TO_TDJSON_DLL> required\n');
    process.exit(1);
  }
}

if (!existsSync(dllPath)) {
  process.stderr.write(`Error: DLL not found at "${dllPath}"\n`);
  process.exit(1);
}

if (!/^[a-f0-9]{40}$/i.test(commit)) {
  process.stderr.write('Error: --commit must be a 40-character hexadecimal git commit SHA\n');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

// Copy DLL into outDir if it is not already there
const targetDll = join(outDir, 'tdjson.dll');
if (resolve(dllPath) !== resolve(targetDll)) {
  copyFileSync(dllPath, targetDll);
  process.stdout.write(`Copied ${dllPath} -> ${targetDll}\n`);
}

const dllBytes = readFileSync(targetDll);
const sha256 = createHash('sha256').update(dllBytes).digest('hex');

const manifest = {
  schema: 1,
  platform: 'win32-x64',
  protocol: 1,
  upstream: 'https://github.com/tdlib/td',
  upstreamCommit: commit.toLowerCase(),
  api: 'td-json-1.x',
  noticeReview: 'OWNER_REVIEW_REQUIRED',
  artifacts: {
    'tdjson.dll': sha256,
  },
};

const manifestPath = join(outDir, 'manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

process.stdout.write(`Successfully generated native manifest: ${manifestPath}\n`);
process.stdout.write(`tdjson.dll SHA256: ${sha256}\n`);
