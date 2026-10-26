#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, lstatSync, readdirSync } from 'node:fs';
import { resolve, join, dirname, isAbsolute, relative, parse } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

function isOutside(base, target) {
  const rel = relative(base, target);
  return rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel);
}

function isPlaceholderCommit(commit) {
  if (!commit || typeof commit !== 'string') return true;
  const lower = commit.trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(lower)) return true;
  if (/^([a-f0-9])\1{39}$/.test(lower)) return true;
  if (/^(0123456789|abcdef|deadbeef|1234567890)/.test(lower)) return true;
  return false;
}

function getDefaultOutDir() {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return resolve(join(process.env.LOCALAPPDATA, 'telegram-sales-mcp', 'native-bundle'));
  }
  if (process.env.USERPROFILE) {
    return resolve(join(process.env.USERPROFILE, '.telegram-sales-mcp', 'native-bundle'));
  }
  if (process.env.HOME) {
    return resolve(join(process.env.HOME, '.telegram-sales-mcp', 'native-bundle'));
  }
  return undefined;
}

const args = process.argv.slice(2);
let dllPath = undefined;
let commit = undefined;
let outDir = undefined;
let depsList = [];

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
  } else if (args[i] === '--deps' && args[i + 1]) {
    depsList = args[i + 1].split(',').map((s) => resolve(s.trim())).filter(Boolean);
    i++;
  } else if (args[i] === '--help') {
    process.stdout.write(
      'Usage: node scripts/generate-native-manifest.mjs --dll <PATH_TO_TDJSON_DLL> --commit <REAL_TDLIB_COMMIT_SHA> [--out <USER_NATIVE_BUNDLE_DIR>] [--deps <DEP1.DLL,DEP2.DLL>]\n\n' +
      'Generates a schema 1 native manifest matching the built tdjson.dll for Windows x64.\n' +
      'The output directory must be an external user-owned location outside the repository root.\n'
    );
    process.exit(0);
  } else if (!args[i].startsWith('--') && !dllPath && (args[i].endsWith('.dll') || existsSync(args[i]))) {
    // Positional fallback for DLL path if supplied without --dll flag
    dllPath = resolve(args[i]);
  }
}

// 1. Validate --dll
if (!dllPath) {
  process.stderr.write('Error: --dll <PATH_TO_TDJSON_DLL> is required. Specify the path to your compiled tdjson.dll.\n');
  process.exit(1);
}

if (!existsSync(dllPath)) {
  process.stderr.write(`Error: DLL not found at "${dllPath}"\n`);
  process.exit(1);
}

const dllStat = lstatSync(dllPath);
if (dllStat.isSymbolicLink() || !dllStat.isFile()) {
  process.stderr.write(`Error: DLL at "${dllPath}" must be a regular file, not a symbolic link or directory.\n`);
  process.exit(1);
}

// 2. Validate --commit
if (!commit) {
  process.stderr.write('Error: --commit <REAL_TDLIB_COMMIT_SHA> is required. Provide the 40-character hexadecimal git commit SHA of upstream TDLib.\n');
  process.exit(1);
}

if (isPlaceholderCommit(commit)) {
  process.stderr.write('Error: --commit cannot be a placeholder hash. Provide the actual 40-character upstream TDLib git commit SHA.\n');
  process.exit(1);
}

// 3. Resolve and validate output directory
if (!outDir) {
  outDir = getDefaultOutDir();
}

if (!outDir) {
  process.stderr.write('Error: --out <OUTPUT_DIR> is required when default per-user directory cannot be determined.\n');
  process.exit(1);
}

outDir = resolve(outDir);

if (!isAbsolute(outDir) || parse(outDir).root === outDir) {
  process.stderr.write(`Error: Output directory "${outDir}" must be an absolute path and cannot be the filesystem root.\n`);
  process.exit(1);
}

// Ensure outDir is strictly outside projectRoot and dirname(projectRoot)
const protectedRoots = [projectRoot, dirname(projectRoot)];
for (const p of protectedRoots) {
  const q = resolve(p);
  if (!isOutside(q, outDir) || !isOutside(outDir, q)) {
    process.stderr.write(
      `Error: Output directory cannot be inside or contain repository root or its parent ("${outDir}").\n` +
      `Choose an external location such as %LOCALAPPDATA%\\telegram-sales-mcp\\native-bundle or pass --out <ABSOLUTE_EXTERNAL_DIR>.\n`
    );
    process.exit(1);
  }
}

// Check existing outDir
if (existsSync(outDir)) {
  const outStat = lstatSync(outDir);
  if (outStat.isSymbolicLink() || !outStat.isDirectory()) {
    process.stderr.write(`Error: Output location "${outDir}" exists but is not a regular directory.\n`);
    process.exit(1);
  }
} else {
  mkdirSync(outDir, { recursive: true });
}

// Copy DLL into outDir
const targetDll = join(outDir, 'tdjson.dll');
if (resolve(dllPath) !== resolve(targetDll)) {
  copyFileSync(dllPath, targetDll);
  process.stdout.write(`Copied ${dllPath} -> ${targetDll}\n`);
}

// Copy additional dependency DLLs if specified
for (const dep of depsList) {
  if (existsSync(dep)) {
    const depName = resolve(dep);
    const targetDep = join(outDir, depName.split(/[\\/]/).pop());
    if (depName !== targetDep) {
      copyFileSync(dep, targetDep);
      process.stdout.write(`Copied dependency ${dep} -> ${targetDep}\n`);
    }
  } else {
    process.stderr.write(`Error: Dependency DLL not found at "${dep}"\n`);
    process.exit(1);
  }
}

// Index all DLLs in outDir
const artifacts = {};
for (const file of readdirSync(outDir)) {
  if (file.toLowerCase().endsWith('.dll')) {
    const fullPath = join(outDir, file);
    const st = lstatSync(fullPath);
    if (!st.isSymbolicLink() && st.isFile()) {
      const bytes = readFileSync(fullPath);
      artifacts[file] = createHash('sha256').update(bytes).digest('hex');
    }
  }
}

if (!('tdjson.dll' in artifacts)) {
  process.stderr.write(`Error: tdjson.dll was not found in artifacts after copy.\n`);
  process.exit(1);
}

const manifest = {
  schema: 1,
  platform: 'win32-x64',
  protocol: 1,
  upstream: 'https://github.com/tdlib/td',
  upstreamCommit: commit.toLowerCase(),
  api: 'td-json-1.x',
  noticeReview: 'OWNER_REVIEW_REQUIRED',
  artifacts,
};

const manifestPath = join(outDir, 'manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

process.stdout.write(`Successfully generated native manifest: ${manifestPath}\n`);
process.stdout.write(`tdjson.dll SHA256: ${artifacts['tdjson.dll']}\n`);
