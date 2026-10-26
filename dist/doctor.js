import { existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkNativeManifestQualification } from './runtime/native-policy.js';
import { verifyNativeBundle } from './runtime/native-integrity.js';
export function runDoctor(options = {}) {
    const checks = [];
    const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
    const writesRequested = Boolean(options.writesEnabled ?? (process.env.TELEGRAM_SINGLE_USER_WRITES === '1'));
    // 1. Node.js Runtime Check (>= 22.19.0)
    const nodeVersion = process.version;
    const versionParts = nodeVersion.slice(1).split('.').map(Number);
    const nodeMajor = versionParts[0] ?? 0;
    const nodeMinor = versionParts[1] ?? 0;
    const nodePatch = versionParts[2] ?? 0;
    const isNodeQualified = nodeMajor > 22 ||
        (nodeMajor === 22 && (nodeMinor > 19 || (nodeMinor === 19 && nodePatch >= 0)));
    if (isNodeQualified) {
        checks.push({
            name: 'Node.js Runtime',
            status: 'PASS',
            message: `${nodeVersion} (>= 22.19.0 required)`,
        });
    }
    else {
        checks.push({
            name: 'Node.js Runtime',
            status: 'FAIL',
            message: `${nodeVersion} is below required Node 22.19.0+`,
            repairStep: 'Install Node.js 22.19.0 or later: https://nodejs.org/',
        });
    }
    // 2. Operating System Check
    const isWinX64 = process.platform === 'win32' && process.arch === 'x64';
    if (isWinX64) {
        checks.push({
            name: 'Operating System',
            status: 'PASS',
            message: 'Windows x64',
        });
    }
    else {
        checks.push({
            name: 'Operating System',
            status: 'WARN',
            message: `Running on ${process.platform}-${process.arch}; official single-user build targets Windows x64`,
        });
    }
    // 3. Python Executable Check (>= 3.11, 64-bit)
    const pythonPath = options.python ?? 'python';
    let pythonQualified = false;
    let resolvedPython = pythonPath;
    const pyCode = 'import sys; v = sys.version_info; is_64 = sys.maxsize > 2**32; ok = (v.major == 3 and v.minor >= 11) and is_64; print(f"{v.major}.{v.minor}.{v.micro}|{is_64}|{ok}|{sys.executable}")';
    const pyCheck = spawnSync(pythonPath, ['-c', pyCode], {
        encoding: 'utf8',
    });
    if (pyCheck.status === 0 && pyCheck.stdout) {
        const [ver, is64Str, okStr, pyExe] = pyCheck.stdout.trim().split('|');
        if (pyExe && existsSync(pyExe)) {
            resolvedPython = pyExe;
        }
        if (okStr === 'True') {
            pythonQualified = true;
            checks.push({
                name: 'Python 3.11+ x64',
                status: 'PASS',
                message: `Python ${ver} 64-bit available via "${resolvedPython}"`,
            });
        }
        else {
            checks.push({
                name: 'Python 3.11+ x64',
                status: 'FAIL',
                message: `Python version "${ver}" (${is64Str === 'True' ? '64-bit' : '32-bit'}) is incompatible; requires Python 3.11+ 64-bit`,
                repairStep: 'Install Python 3.11+ 64-bit on Windows and ensure it is on PATH, or pass --python <PATH>',
            });
        }
    }
    else {
        checks.push({
            name: 'Python 3.11+ x64',
            status: 'FAIL',
            message: `Python not found or execution failed via "${pythonPath}"`,
            repairStep: 'Install Python 3.11+ 64-bit on Windows and ensure it is on PATH, or pass --python <PATH>',
        });
    }
    // 4. Native TDLib Manifest & DLL Integrity
    let nativeBundleVerified = false;
    const manifestPath = options.manifest;
    if (manifestPath) {
        if (!existsSync(manifestPath)) {
            checks.push({
                name: 'Native TDLib Bundle',
                status: writesRequested ? 'FAIL' : 'WARN',
                message: `Manifest file not found at "${manifestPath}"`,
                repairStep: 'Generate manifest: node scripts/generate-native-manifest.mjs --dll <PATH_TO_TDJSON_DLL> --commit <REAL_TDLIB_COMMIT_SHA> --out <USER_NATIVE_BUNDLE_DIR>',
            });
        }
        else {
            const manifestQual = checkNativeManifestQualification(manifestPath);
            if (manifestQual !== 'VERIFIED') {
                checks.push({
                    name: 'Native TDLib Bundle',
                    status: writesRequested ? 'FAIL' : 'WARN',
                    message: `Manifest at "${manifestPath}" is invalid or uses a placeholder commit (HOLD)`,
                    repairStep: 'Regenerate manifest with a real upstream TDLib git commit SHA: node scripts/generate-native-manifest.mjs --dll <PATH_TO_TDJSON_DLL> --commit <REAL_TDLIB_COMMIT_SHA> --out <USER_NATIVE_BUNDLE_DIR>',
                });
            }
            else {
                try {
                    const wrapperPath = join(projectRoot, 'native', 'tdjson_wrapper.py');
                    verifyNativeBundle(manifestPath, wrapperPath, resolvedPython, [projectRoot, dirname(projectRoot)]);
                    nativeBundleVerified = true;
                    checks.push({
                        name: 'Native TDLib Bundle',
                        status: 'PASS',
                        message: 'Manifest and native DLL verified with SHA-256 match (offline integrity verified)',
                    });
                }
                catch (err) {
                    checks.push({
                        name: 'Native TDLib Bundle',
                        status: writesRequested ? 'FAIL' : 'WARN',
                        message: `Manifest verification failed: ${err instanceof Error ? err.message : String(err)}`,
                        repairStep: 'Ensure tdjson.dll matches manifest SHA-256 and directory is outside repository: node scripts/generate-native-manifest.mjs --dll <PATH_TO_TDJSON_DLL> --commit <REAL_TDLIB_COMMIT_SHA> --out <USER_NATIVE_BUNDLE_DIR>',
                    });
                }
            }
        }
    }
    else {
        // Check if default native bundle exists
        const defaultManifest = process.platform === 'win32' && process.env.LOCALAPPDATA
            ? join(process.env.LOCALAPPDATA, 'telegram-sales-mcp', 'native-bundle', 'manifest.json')
            : undefined;
        if (defaultManifest && existsSync(defaultManifest)) {
            const manifestQual = checkNativeManifestQualification(defaultManifest);
            if (manifestQual === 'VERIFIED') {
                try {
                    const wrapperPath = join(projectRoot, 'native', 'tdjson_wrapper.py');
                    verifyNativeBundle(defaultManifest, wrapperPath, resolvedPython, [projectRoot, dirname(projectRoot)]);
                    nativeBundleVerified = true;
                    checks.push({
                        name: 'Native TDLib Bundle',
                        status: 'PASS',
                        message: `Default bundle verified at "${defaultManifest}"`,
                    });
                }
                catch {
                    checks.push({
                        name: 'Native TDLib Bundle',
                        status: writesRequested ? 'FAIL' : 'WARN',
                        message: `Default bundle found at "${defaultManifest}" but verification failed`,
                        repairStep: 'Regenerate manifest: node scripts/generate-native-manifest.mjs --dll <PATH_TO_TDJSON_DLL> --commit <REAL_TDLIB_COMMIT_SHA> --out <USER_NATIVE_BUNDLE_DIR>',
                    });
                }
            }
            else {
                checks.push({
                    name: 'Native TDLib Bundle',
                    status: writesRequested ? 'FAIL' : 'WARN',
                    message: `Default bundle at "${defaultManifest}" is not qualified (HOLD)`,
                    repairStep: 'Regenerate manifest: node scripts/generate-native-manifest.mjs --dll <PATH_TO_TDJSON_DLL> --commit <REAL_TDLIB_COMMIT_SHA> --out <USER_NATIVE_BUNDLE_DIR>',
                });
            }
        }
        else {
            checks.push({
                name: 'Native TDLib Bundle',
                status: writesRequested ? 'FAIL' : 'WARN',
                message: 'No --native-manifest specified and default native bundle not found',
                repairStep: 'Obtain or build tdjson.dll and generate manifest: node scripts/generate-native-manifest.mjs --dll <PATH_TO_TDJSON_DLL> --commit <REAL_TDLIB_COMMIT_SHA> --out <USER_NATIVE_BUNDLE_DIR>',
            });
        }
    }
    // 5. Telegram Account Session
    let sessionVerified = false;
    if (options.state) {
        if (existsSync(options.state)) {
            const hasSession = existsSync(join(options.state, 'session.json'));
            const hasVault = existsSync(join(options.state, 'vault.bin'));
            if (hasSession && hasVault) {
                sessionVerified = true;
                checks.push({
                    name: 'Telegram Account Session',
                    status: 'PASS',
                    message: `Session and vault files present in "${options.state}" (Note: live authorization confirmed upon runtime connection)`,
                });
            }
            else {
                checks.push({
                    name: 'Telegram Account Session',
                    status: writesRequested ? 'FAIL' : 'WARN',
                    message: `State directory "${options.state}" exists but session.json or vault.bin is missing`,
                    repairStep: 'Run private terminal login: node dist/login.js --state <DIR> --native-manifest <MANIFEST> --python <PYTHON>',
                });
            }
        }
        else {
            checks.push({
                name: 'Telegram Account Session',
                status: writesRequested ? 'FAIL' : 'WARN',
                message: `State directory "${options.state}" does not exist`,
                repairStep: 'Run private terminal login: node dist/login.js --state <DIR> --native-manifest <MANIFEST> --python <PYTHON>',
            });
        }
    }
    else {
        checks.push({
            name: 'Telegram Account Session',
            status: writesRequested ? 'FAIL' : 'WARN',
            message: 'No --state provided; server runs in unconfigured foundation mode',
            repairStep: 'Run private terminal login: node dist/login.js --state <DIR> --native-manifest <MANIFEST> --python <PYTHON>',
        });
    }
    // 6. Sales CRM Database
    let crmVerified = false;
    if (options.crm) {
        if (existsSync(options.crm)) {
            const hasConsent = existsSync(join(options.crm, 'consent.json'));
            const hasDb = existsSync(join(options.crm, 'sales.sqlite'));
            if (hasConsent && hasDb) {
                crmVerified = true;
                checks.push({
                    name: 'Sales CRM Database',
                    status: 'PASS',
                    message: `Consented CRM ready in "${options.crm}"`,
                });
            }
            else {
                checks.push({
                    name: 'Sales CRM Database',
                    status: 'WARN',
                    message: `CRM directory "${options.crm}" exists but missing consent.json or sales.sqlite`,
                    repairStep: 'Initialize CRM: node dist/crm-init.js <NEW_CRM_DIRECTORY>',
                });
            }
        }
        else {
            checks.push({
                name: 'Sales CRM Database',
                status: 'WARN',
                message: `CRM directory "${options.crm}" does not exist`,
                repairStep: 'Initialize CRM: node dist/crm-init.js <NEW_CRM_DIRECTORY>',
            });
        }
    }
    else {
        checks.push({
            name: 'Sales CRM Database',
            status: 'WARN',
            message: 'No --crm provided; CRM tools not loaded',
            repairStep: 'Initialize CRM: node dist/crm-init.js <NEW_CRM_DIRECTORY>',
        });
    }
    // 7. Write Permissions & Chat Binding
    const writes = writesRequested;
    const chatId = options.chatId ?? process.env.TELEGRAM_SINGLE_USER_CHAT_ID;
    let writeActionsReady = false;
    if (writes && chatId) {
        if (nativeBundleVerified && sessionVerified) {
            writeActionsReady = true;
            checks.push({
                name: 'Write Actions Opt-in',
                status: 'PASS',
                message: `Enabled and bound to chat ${chatId} (preconditions verified)`,
            });
        }
        else {
            checks.push({
                name: 'Write Actions Opt-in',
                status: 'FAIL',
                message: `Writes requested for chat ${chatId}, but native runtime or account session preconditions are not met`,
                repairStep: 'Resolve native manifest and session state prerequisites before launching write mode',
            });
        }
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
            repairStep: 'To enable 13 Telegram action tools: pass --writes --chat-id <ID> or set TELEGRAM_SINGLE_USER_WRITES=1 and TELEGRAM_SINGLE_USER_CHAT_ID=<chat_id>',
        });
    }
    // 8. Tool Counting: registered schemas vs. ready to execute
    let toolsRegistered = 11; // 11 Read tool schemas always registered
    if (options.crm && existsSync(options.crm) && existsSync(join(options.crm, 'consent.json'))) {
        toolsRegistered += 8;
    }
    if (writes && chatId) {
        toolsRegistered += 13;
        if (options.crm && existsSync(options.crm) && existsSync(join(options.crm, 'consent.json'))) {
            toolsRegistered += 1;
        }
    }
    let toolsReady = 0;
    if (crmVerified) {
        toolsReady += 8; // Local SQLite tools ready to execute
    }
    if (nativeBundleVerified && sessionVerified) {
        toolsReady += 11; // Telegram read tools ready to execute with account
        if (writeActionsReady) {
            toolsReady += 13; // Telegram action tools ready
            if (crmVerified) {
                toolsReady += 1; // 9th CRM tool (telegram_sales_quick_reply_send)
            }
        }
    }
    const passCount = checks.filter((c) => c.status === 'PASS').length;
    const warnCount = checks.filter((c) => c.status === 'WARN').length;
    const failCount = checks.filter((c) => c.status === 'FAIL').length;
    const isHealthy = failCount === 0;
    const summary = `Doctor Result: ${passCount} PASS, ${warnCount} WARN, ${failCount} FAIL. Configured prerequisites (live not yet validated): ${toolsReady}/33 (Registered schemas: ${toolsRegistered}/33).`;
    return {
        checks,
        toolsReady,
        toolsRegistered,
        toolsAvailable: toolsReady,
        isHealthy,
        summary,
    };
}
