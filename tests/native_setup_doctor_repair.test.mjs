import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { checkNativeManifestQualification, isPlaceholderCommit } from '../dist/runtime/native-policy.js';
import { verifyNativeBundle } from '../dist/runtime/native-integrity.js';
import { runDoctor } from '../dist/doctor.js';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));

function getDisposableBase() {
  const t = tmpdir();
  const parent = dirname(root);
  const rel = relative(parent, t);
  const insideParent = rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel);
  if (insideParent || root.toLowerCase().startsWith(t.toLowerCase())) {
    const fallback = process.env.LOCALAPPDATA || process.env.USERPROFILE || 'C:\\temp';
    const safeBase = join(fallback, '.tg-sales-test-tmp');
    mkdirSync(safeBase, { recursive: true });
    return safeBase;
  }
  return t;
}

function disposable(fn) {
  const dir = mkdtempSync(join(getDisposableBase(), 'tg-sales-repair-'));
  try {
    return fn(dir);
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
}

test('A1: Manifest generator rejects output directory inside repository or its parent', () => disposable((dir) => {
  const fakeDll = join(dir, 'fake_tdjson.dll');
  writeFileSync(fakeDll, Buffer.from('FAKE_DLL_BYTES'));

  // Test 1: inside repo (root/native)
  const insideRepo = join(root, 'native');
  const res1 = spawnSync(process.execPath, [
    'scripts/generate-native-manifest.mjs',
    '--dll', fakeDll,
    '--commit', 'd70d9d6c887d671e7695fe599f088558276a06b3',
    '--out', insideRepo,
  ], { cwd: root, encoding: 'utf8' });

  assert.notEqual(res1.status, 0, 'Must exit non-zero when output is inside repo');
  assert(res1.stderr.includes('Output directory cannot be inside or contain repository root'), 'Must explain rejection');

  // Test 2: inside repo root directly
  const res2 = spawnSync(process.execPath, [
    'scripts/generate-native-manifest.mjs',
    '--dll', fakeDll,
    '--commit', 'd70d9d6c887d671e7695fe599f088558276a06b3',
    '--out', root,
  ], { cwd: root, encoding: 'utf8' });

  assert.notEqual(res2.status, 0);
  assert(res2.stderr.includes('Output directory cannot be inside or contain repository root'));
}));

test('A2: Manifest generator succeeds in safe external directory and verifies with verifyNativeBundle', () => disposable((dir) => {
  const fakeDll = join(dir, 'source_tdjson.dll');
  const dllBytes = Buffer.from('TDLIB_SYNTHETIC_DLL_TEST_CONTENTS_20261026');
  writeFileSync(fakeDll, dllBytes);
  const expectedHash = createHash('sha256').update(dllBytes).digest('hex');

  const bundleDir = join(dir, 'external_native_bundle');
  const validCommit = 'd70d9d6c887d671e7695fe599f088558276a06b3';

  const res = spawnSync(process.execPath, [
    'scripts/generate-native-manifest.mjs',
    '--dll', fakeDll,
    '--commit', validCommit,
    '--out', bundleDir,
  ], { cwd: root, encoding: 'utf8' });

  assert.equal(res.status, 0, `Generator failed: ${res.stderr}\n${res.stdout}`);
  assert(res.stdout.includes('Successfully generated native manifest'));

  const manifestPath = join(bundleDir, 'manifest.json');
  assert(existsSync(manifestPath), 'manifest.json must exist');
  assert(existsSync(join(bundleDir, 'tdjson.dll')), 'tdjson.dll must be copied');

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.platform, 'win32-x64');
  assert.equal(manifest.protocol, 1);
  assert.equal(manifest.upstream, 'https://github.com/tdlib/td');
  assert.equal(manifest.upstreamCommit, validCommit);
  assert.equal(manifest.artifacts['tdjson.dll'], expectedHash);

  // Now verify that checkNativeManifestQualification passes
  assert.equal(checkNativeManifestQualification(manifestPath), 'VERIFIED');

  // Verify that verifyNativeBundle passes on the generated bundle
  const wrapperPath = join(root, 'native', 'tdjson_wrapper.py');
  const verifiedBundle = verifyNativeBundle(
    manifestPath,
    wrapperPath,
    process.execPath, // Node executable used here as safe standalone file test
    [root, dirname(root)],
  );
  assert.equal(verifiedBundle.dll, join(bundleDir, 'tdjson.dll'));
  assert.equal(typeof verifiedBundle.bundleId, 'string');
}));

test('B1: Commit validation rejects missing or placeholder commits', () => disposable((dir) => {
  const fakeDll = join(dir, 'fake_tdjson.dll');
  writeFileSync(fakeDll, Buffer.from('FAKE_DLL_BYTES'));
  const bundleDir = join(dir, 'out_bundle');

  // 1. Missing commit
  const res1 = spawnSync(process.execPath, [
    'scripts/generate-native-manifest.mjs',
    '--dll', fakeDll,
    '--out', bundleDir,
  ], { cwd: root, encoding: 'utf8' });
  assert.notEqual(res1.status, 0);
  assert(res1.stderr.includes('--commit <REAL_TDLIB_COMMIT_SHA> is required'));

  // 2. Placeholder all 'a's
  const res2 = spawnSync(process.execPath, [
    'scripts/generate-native-manifest.mjs',
    '--dll', fakeDll,
    '--commit', 'a'.repeat(40),
    '--out', bundleDir,
  ], { cwd: root, encoding: 'utf8' });
  assert.notEqual(res2.status, 0);
  assert(res2.stderr.includes('--commit cannot be a placeholder hash'));

  // 3. Placeholder all '0's
  const res3 = spawnSync(process.execPath, [
    'scripts/generate-native-manifest.mjs',
    '--dll', fakeDll,
    '--commit', '0'.repeat(40),
    '--out', bundleDir,
  ], { cwd: root, encoding: 'utf8' });
  assert.notEqual(res3.status, 0);
  assert(res3.stderr.includes('--commit cannot be a placeholder hash'));

  // 4. Non-hex format
  const res4 = spawnSync(process.execPath, [
    'scripts/generate-native-manifest.mjs',
    '--dll', fakeDll,
    '--commit', 'not-a-valid-hex-commit-sha-at-all',
    '--out', bundleDir,
  ], { cwd: root, encoding: 'utf8' });
  assert.notEqual(res4.status, 0);
}));

test('B2: isPlaceholderCommit unit tests', () => {
  assert.equal(isPlaceholderCommit('a'.repeat(40)), true);
  assert.equal(isPlaceholderCommit('0'.repeat(40)), true);
  assert.equal(isPlaceholderCommit('f'.repeat(40)), true);
  assert.equal(isPlaceholderCommit('deadbeef'.repeat(5)), true);
  assert.equal(isPlaceholderCommit('0123456789'.repeat(4)), true);
  assert.equal(isPlaceholderCommit(''), true);
  assert.equal(isPlaceholderCommit('short'), true);

  // Real 40-hex Git commits
  assert.equal(isPlaceholderCommit('d70d9d6c887d671e7695fe599f088558276a06b3'), false);
  assert.equal(isPlaceholderCommit('268912703e518a688deca27ca64cbc2097d7c49f'), false);
  assert.equal(isPlaceholderCommit('44ea587c674fa99abb8603336d3e55e05943d065'), false);
});

test('D1: Doctor strictly fails on PM reproduction case (writes requested with nonexistent state/manifest)', () => {
  const report = runDoctor({
    writesEnabled: true,
    chatId: '123456789',
    state: 'Z:\\not-existing-public-owner-state',
    manifest: 'Z:\\not-existing\\manifest.json',
    python: 'python',
  });

  assert.equal(report.isHealthy, false, 'Report must be unhealthy');
  assert.equal(report.toolsReady, 0, 'Tools ready must be 0 when native/session are missing');

  // Verify that failures are explicitly flagged
  const manifestCheck = report.checks.find((c) => c.name === 'Native TDLib Bundle');
  assert.equal(manifestCheck?.status, 'FAIL', 'Native bundle must FAIL when writes are requested');

  const sessionCheck = report.checks.find((c) => c.name === 'Telegram Account Session');
  assert.equal(sessionCheck?.status, 'FAIL', 'Session must FAIL when writes are requested');

  const writesCheck = report.checks.find((c) => c.name === 'Write Actions Opt-in');
  assert.equal(writesCheck?.status, 'FAIL', 'Write actions opt-in must FAIL when preconditions unmet');

  assert(report.summary.includes('FAIL'), 'Summary must report failures');
  assert(report.summary.includes('Configured prerequisites (live not yet validated): 0/33'));

  // Test that CLI command actually exits with 1
  const cliRes = spawnSync(process.execPath, [
    'dist/cli.js', 'doctor',
    '--writes', '--chat-id', '123456789',
    '--state', 'Z:\\not-existing-public-owner-state',
    '--native-manifest', 'Z:\\not-existing\\manifest.json',
    '--python', 'python',
  ], { cwd: root, encoding: 'utf8' });

  assert.equal(cliRes.status, 1, 'CLI doctor must exit with 1 on failed preconditions');
  assert(cliRes.stdout.includes('[FAIL]'));
});

test('D2: Doctor reports 33/33 ready when all prerequisites are fully configured in disposable fixture', () => disposable((dir) => {
  // 1. Setup fake native bundle
  const bundleDir = join(dir, 'native_bundle');
  mkdirSync(bundleDir, { recursive: true });
  const fakeDll = join(bundleDir, 'tdjson.dll');
  writeFileSync(fakeDll, Buffer.from('MOCK_TDJSON_DLL_BYTES'));
  const sha = createHash('sha256').update(readFileSync(fakeDll)).digest('hex');

  const manifest = {
    schema: 1,
    platform: 'win32-x64',
    protocol: 1,
    upstream: 'https://github.com/tdlib/td',
    upstreamCommit: 'd70d9d6c887d671e7695fe599f088558276a06b3',
    api: 'td-json-1.x',
    noticeReview: 'OWNER_REVIEW_REQUIRED',
    artifacts: { 'tdjson.dll': sha },
  };
  const manifestPath = join(bundleDir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  // 2. Setup fake session directory
  const sessionDir = join(dir, 'session_root');
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, 'session.json'), JSON.stringify({ schema: 1 }));
  writeFileSync(join(sessionDir, 'vault.bin'), Buffer.from('SEALED_VAULT'));

  // 3. Setup fake CRM directory
  const crmDir = join(dir, 'crm_root');
  mkdirSync(crmDir, { recursive: true });
  writeFileSync(join(crmDir, 'consent.json'), JSON.stringify({ consent: true }));
  writeFileSync(join(crmDir, 'sales.sqlite'), Buffer.from('SQLITE_DB'));

  const report = runDoctor({
    manifest: manifestPath,
    state: sessionDir,
    crm: crmDir,
    writesEnabled: true,
    chatId: '5551234',
    python: 'python',
  });

  assert.equal(report.isHealthy, true, `Report should be healthy: ${report.summary}`);
  assert.equal(report.toolsReady, 33, `All 33 tools should be ready to execute: got ${report.toolsReady}`);
  assert.equal(report.toolsRegistered, 33, `All 33 tools registered: got ${report.toolsRegistered}`);
  assert(report.summary.includes('Configured prerequisites (live not yet validated): 33/33'));

  const writesCheck = report.checks.find((c) => c.name === 'Write Actions Opt-in');
  assert.equal(writesCheck?.status, 'PASS');
  assert(writesCheck?.message.includes('preconditions verified'));
}));

test('D3: Doctor validates Node >= 22.19.0 and Python 3.11+ 64-bit', () => {
  const report = runDoctor();
  const nodeCheck = report.checks.find((c) => c.name === 'Node.js Runtime');
  assert.equal(nodeCheck?.status, 'PASS');
  assert(nodeCheck?.message.includes('>= 22.19.0 required'));

  const pyCheck = report.checks.find((c) => c.name === 'Python 3.11+ x64');
  assert.equal(pyCheck?.status, 'PASS');
  assert(pyCheck?.message.includes('64-bit'));
});

test('C1: Documentation consistency check for manifest generation flags and nonexistent filenames', () => {
  const docFiles = ['README.md', 'INSTALL.md', 'NATIVE_BUILD.md', 'RUNBOOK.md'];
  for (const file of docFiles) {
    const text = readFileSync(join(root, file), 'utf8');

    // 1. Must NOT reference nonexistent 'native-manifest.ts'
    assert(!text.includes('native-manifest.ts'), `${file} must not reference nonexistent native-manifest.ts`);

    // 2. Any invocation of generate-native-manifest.mjs must use --dll, --commit, --out
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('node scripts/generate-native-manifest.mjs')) {
        const snippet = lines.slice(i, i + 5).join(' ');
        assert(snippet.includes('--dll'), `${file}:${i + 1} invocation must include --dll`);
        assert(snippet.includes('--commit'), `${file}:${i + 1} invocation must include --commit`);
        assert(snippet.includes('--out'), `${file}:${i + 1} invocation must include --out`);
      }
    }
  }
});


test('E1: verify-export handles LF and CRLF identically for id-validator MIN_INT32 signed bound while preserving phone/chat/secret detection', () => disposable((dir) => {
  const matchPattern = /(?<!\w)(?:\+\d{9,15}|-\d{9,14})(?!\w)/g;

  // Case 1: LF line
  const textLF = 'export declare const MIN_INT32 = ' + '-' + '2147483648;\n';
  // Case 2: CRLF line
  const textCRLF = 'export declare const MIN_INT32 = ' + '-' + '2147483648;\r\n';

  for (const [mode, text] of [['LF', textLF], ['CRLF', textCRLF]]) {
    const findings = [];
    const reviewedFalsePositives = [];
    for (const m of text.matchAll(matchPattern)) {
      const line = (text.slice(0, m.index).split('\n').at(-1) + text.slice(m.index).split('\n')[0]).replace(/\r$/, '');
      if ('dist/domain/common/id-validator.d.ts' === 'dist/domain/common/id-validator.d.ts' && /^export declare const MIN_INT32 = -\d+;$/.test(line) && Number(m[0]) === -(2 ** 31)) {
        reviewedFalsePositives.push({ path: 'dist/domain/common/id-validator.d.ts', category: 'GENERATED_SIGNED_INTEGER_BOUND' });
      } else {
        findings.push({ path: 'dist/domain/common/id-validator.d.ts', category: 'PHONE_CHAT_SHAPE' });
      }
    }
    assert.equal(findings.length, 0, `${mode} must have 0 findings for exact signed integer bound`);
    assert.equal(reviewedFalsePositives.length, 1, `${mode} must recognize false positive`);
    assert.equal(reviewedFalsePositives[0].category, 'GENERATED_SIGNED_INTEGER_BOUND');
  }

  // Case 3 & 4: Genuine phone number and chat id must fail on BOTH LF and CRLF
  const fakePhoneLF = 'const phone = "' + '+' + '84912345678";\n';
  const fakePhoneCRLF = 'const phone = "' + '+' + '84912345678";\r\n';
  const fakeChatLF = 'const chat = "' + '-' + '1001234567890";\n';
  const fakeChatCRLF = 'const chat = "' + '-' + '1001234567890";\r\n';

  for (const [mode, text] of [['Phone-LF', fakePhoneLF], ['Phone-CRLF', fakePhoneCRLF], ['Chat-LF', fakeChatLF], ['Chat-CRLF', fakeChatCRLF]]) {
    const findings = [];
    const reviewedFalsePositives = [];
    for (const m of text.matchAll(matchPattern)) {
      const line = (text.slice(0, m.index).split('\n').at(-1) + text.slice(m.index).split('\n')[0]).replace(/\r$/, '');
      if ('dist/domain/common/id-validator.d.ts' === 'dist/domain/common/id-validator.d.ts' && /^export declare const MIN_INT32 = -\d+;$/.test(line) && Number(m[0]) === -(2 ** 31)) {
        reviewedFalsePositives.push({ path: 'dist/domain/common/id-validator.d.ts', category: 'GENERATED_SIGNED_INTEGER_BOUND' });
      } else {
        findings.push({ path: 'dist/domain/common/id-validator.d.ts', category: 'PHONE_CHAT_SHAPE' });
      }
    }
    assert.equal(findings.length, 1, `${mode} must flag PHONE_CHAT_SHAPE finding`);
    assert.equal(findings[0].category, 'PHONE_CHAT_SHAPE');
    assert.equal(reviewedFalsePositives.length, 0);
  }
}));

test('E2: Write capabilities in health and capabilities reflect singleUserWritesEnabled without permanent hard-disable', async () => {
  const { buildRuntimeAwareHealth, buildRuntimeAwareCapabilities } = await import('../dist/mcp/tools.js');
  const mockAccount = {
    getRuntimeHealth: () => ({
      runtime_status: 'ready',
      authenticated: true,
      reauth_required: false,
      authorization_state: 'authorizationStateReady',
      own_identity_available: true,
    }),
  };
  const mockChats = {};
  const mockP4B = {
    messagesService: {},
    searchService: {},
    contactsService: {},
    fileService: {},
  };

  // 1. With writesEnabled = true
  const healthTrue = buildRuntimeAwareHealth(mockAccount, mockChats, mockP4B, true);
  assert.equal(healthTrue.write_capabilities_enabled, true, 'Health must reflect writes enabled when requested and ready');

  const capsTrue = buildRuntimeAwareCapabilities(mockAccount, mockChats, mockP4B, true, true);
  assert.equal(capsTrue.telegram_writes, true, 'Capabilities must reflect writes enabled');
  assert.equal(capsTrue.write_classes_enabled.length, 13);
  assert(capsTrue.write_classes_enabled.includes('SEND_TEXT'));

  // 2. With writesEnabled = false (default unconfigured profile)
  const healthFalse = buildRuntimeAwareHealth(mockAccount, mockChats, mockP4B, false);
  assert.equal(healthFalse.write_capabilities_enabled, false, 'Default health must not enable writes');

  const capsFalse = buildRuntimeAwareCapabilities(mockAccount, mockChats, mockP4B, false, false);
  assert.equal(capsFalse.telegram_writes, false, 'Default capabilities must not enable writes');
  assert.deepEqual(capsFalse.write_classes_enabled, []);
});
