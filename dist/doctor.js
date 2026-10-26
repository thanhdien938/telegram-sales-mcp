import { existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkNativeManifestQualification } from './runtime/native-policy.js';
import { verifyNativeBundle } from './runtime/native-integrity.js';
export function runDoctor(options = {}) {
    const checks = [];
    const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
    // 1. Node runtime
    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0] ?? '0', 10);
    if (nodeMajor >= 22) {
        checks.push({ name: 'Node.js Runtime', status: 'PASS', message: `${nodeVersion} (>= 22.19.0 required)` });
    }
    else {
        checks.push({
            name: 'Node.js Runtime',
            status: 'FAIL',
            message: `${nodeVersion} is below required Node 22.19.0+`,
            repairStep: 'Install Node.js 22.19.0 or later: https://nodejs.org/',
        });
    }
    // 2. OS platform
    const isWinX64 = process.platform === 'win32' && process.arch === 'x64';
    if (isWinX64) {
        checks.push({ name: 'Operating System', status: 'PASS', message: 'Windows x64' });
    }
    else {
        checks.push({
            name: 'Operating System',
            status: 'WARN',
            message: `Running on ${process.platform}-${process.arch}; official single-user build targets Windows x64`,
        });
    }
    // 3. Python executable
    const pythonPath = options.python ?? 'python';
    const pyCheck = spawnSync(pythonPath, ['-c', 'import sys; print(sys.version_info[:2], sys.maxsize > 2**32)'], {
        encoding: 'utf8',
    });
    if (pyCheck.status === 0 && pyCheck.stdout) {
        checks.push({ name: 'Python 3.11+ x64', status: 'PASS', message: `Available via ${pythonPath}` });
    }
    else {
        checks.push({
            name: 'Python 3.11+ x64',
            status: 'FAIL',
            message: `Python not found or incompatible via "${pythonPath}"`,
            repairStep: 'Install Python 3.11+ x64 on Windows and ensure it is on PATH, or pass --python <PATH>',
        });
    }
    // 4. Native TDLib Manifest & DLL
    const manifestPath = options.manifest ?? join(projectRoot, 'native', 'manifest.json');
    const manifestQual = checkNativeManifestQualification(manifestPath);
    if (manifestQual === 'VERIFIED') {
        try {
            const pythonExe = options.python ?? 'python';
            const wrapperPath = join(projectRoot, 'native', 'tdjson_wrapper.py');
            verifyNativeBundle(manifestPath, wrapperPath, pythonExe, [projectRoot, dirname(projectRoot)]);
            checks.push({ name: 'Native TDLib Bundle', status: 'PASS', message: 'manifest.json and tdjson.dll verified' });
        }
        catch (err) {
            checks.push({
                name: 'Native TDLib Bundle',
                status: 'WARN',
                message: `Manifest present but bundle integrity check: ${err instanceof Error ? err.message : String(err)}`,
                repairStep: 'Regenerate manifest for your built tdjson.dll using node scripts/generate-native-manifest.mjs',
            });
        }
    }
    else {
        checks.push({
            name: 'Native TDLib Bundle',
            status: 'WARN',
            message: `No verified manifest at ${manifestPath} (HOLD)`,
            repairStep: 'Obtain or build tdjson.dll (see docs/NATIVE_BUILD.md) and generate manifest: node scripts/generate-native-manifest.mjs --dll <path-to-tdjson.dll> --commit <tdlib-git-sha>',
        });
    }
    // 5. Telegram Session State
    if (options.state && existsSync(options.state)) {
        const hasSession = existsSync(join(options.state, 'session.json'));
        const hasVault = existsSync(join(options.state, 'vault.bin'));
        if (hasSession && hasVault) {
            checks.push({ name: 'Telegram Account Session', status: 'PASS', message: `Found session in ${options.state}` });
        }
        else {
            checks.push({
                name: 'Telegram Account Session',
                status: 'WARN',
                message: `Directory ${options.state} exists but session not yet initialized`,
                repairStep: 'Run login in private terminal: npm run login -- --state <DIR> --native-manifest <MANIFEST> --python <PYTHON>',
            });
        }
    }
    else {
        checks.push({
            name: 'Telegram Account Session',
            status: 'WARN',
            message: options.state ? `State dir ${options.state} absent` : 'No --state provided; server runs in unconfigured foundation mode',
            repairStep: 'Initialize session: npm run login -- --state <DIR> --native-manifest <MANIFEST> --python <PYTHON>',
        });
    }
    // 6. CRM SQLite Store
    if (options.crm && existsSync(options.crm)) {
        const hasConsent = existsSync(join(options.crm, 'consent.json'));
        const hasDb = existsSync(join(options.crm, 'sales.sqlite'));
        if (hasConsent && hasDb) {
            checks.push({ name: 'Sales CRM Database', status: 'PASS', message: `Consented CRM ready in ${options.crm}` });
        }
        else {
            checks.push({
                name: 'Sales CRM Database',
                status: 'WARN',
                message: `CRM directory ${options.crm} exists but missing consent or sales.sqlite`,
                repairStep: 'Initialize CRM: npm run crm:init -- <NEW_CRM_DIRECTORY>',
            });
        }
    }
    else {
        checks.push({
            name: 'Sales CRM Database',
            status: 'WARN',
            message: options.crm ? `CRM directory ${options.crm} absent` : 'No --crm provided; CRM tools not loaded',
            repairStep: 'Initialize CRM: npm run crm:init -- <NEW_CRM_DIRECTORY>',
        });
    }
    // 7. Write permissions & chat binding
    const writes = options.writesEnabled ?? (process.env.TELEGRAM_SINGLE_USER_WRITES === '1');
    const chatId = options.chatId ?? process.env.TELEGRAM_SINGLE_USER_CHAT_ID;
    if (writes && chatId) {
        checks.push({
            name: 'Write Actions Opt-in',
            status: 'PASS',
            message: `Enabled and bound to chat ${chatId}`,
        });
    }
    else if (writes && !chatId) {
        checks.push({
            name: 'Write Actions Opt-in',
            status: 'FAIL',
            message: 'Writes enabled but no target chat ID bound',
            repairStep: 'Set TELEGRAM_SINGLE_USER_CHAT_ID=<chat_id> or pass --chat-id <ID>',
        });
    }
    else {
        checks.push({
            name: 'Write Actions Opt-in',
            status: 'WARN',
            message: 'Single-user writes disabled (default safe read-only profile)',
            repairStep: 'To enable 13 Telegram action tools: set TELEGRAM_SINGLE_USER_WRITES=1 and TELEGRAM_SINGLE_USER_CHAT_ID=<chat_id>',
        });
    }
    // Count available tools
    let toolsCount = 11; // 11 Read tools always registered in base server
    if (options.crm && existsSync(options.crm) && existsSync(join(options.crm, 'consent.json'))) {
        toolsCount += 8; // 8 CRM local tools
    }
    if (writes && chatId) {
        toolsCount += 13; // 13 Telegram Action tools
        if (options.crm && existsSync(options.crm) && existsSync(join(options.crm, 'consent.json'))) {
            toolsCount += 1; // 9th CRM tool (telegram_sales_quick_reply_send)
        }
    }
    const summary = `Doctor Result: ${checks.filter(c => c.status === 'PASS').length} PASS, ${checks.filter(c => c.status === 'WARN').length} WARN, ${checks.filter(c => c.status === 'FAIL').length} FAIL. Tools available in current configuration: ${toolsCount}/33.`;
    return { checks, toolsAvailable: toolsCount, summary };
}
