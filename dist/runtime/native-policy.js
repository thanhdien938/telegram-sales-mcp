import { existsSync, readFileSync } from 'node:fs';
import { assertReadRpc, denyTelegramWrite, WRITE_RPC } from '../policy/read-only.js';
const AUTH = new Set(['setTdlibParameters', 'setAuthenticationPhoneNumber', 'checkAuthenticationCode', 'checkAuthenticationPassword']);
export function assertNativeRpc(scope, method, mode, writesEnabled = false) {
    if (scope === 'read') {
        assertReadRpc(method);
        return;
    }
    if (scope === 'write') {
        if (!writesEnabled || typeof method !== 'string' || !WRITE_RPC.has(method)) {
            denyTelegramWrite();
        }
        return;
    }
    if (typeof method !== 'string' ||
        !AUTH.has(method) ||
        (mode === 'reopen' && method !== 'setTdlibParameters')) {
        throw new Error('PRIVATE_AUTH_RPC_REJECTED');
    }
}
export const NATIVE_BUILD_STATUS = 'HOLD';
export function isPlaceholderCommit(commit) {
    if (!commit || typeof commit !== 'string')
        return true;
    const lower = commit.trim().toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(lower))
        return true;
    // All identical characters: e.g. 40 'a's, 40 '0's, 40 'f's
    if (/^([a-f0-9])\1{39}$/.test(lower))
        return true;
    // Common synthetic or patterned placeholders
    if (/^(0123456789|abcdef|deadbeef|1234567890)/.test(lower))
        return true;
    return false;
}
export function checkNativeManifestQualification(manifestFile) {
    if (!manifestFile || typeof manifestFile !== 'string') {
        return 'HOLD';
    }
    try {
        if (!existsSync(manifestFile))
            return 'HOLD';
        const raw = readFileSync(manifestFile, 'utf8');
        const m = JSON.parse(raw);
        if (m &&
            typeof m === 'object' &&
            m.schema === 1 &&
            m.platform === 'win32-x64' &&
            m.protocol === 1 &&
            m.upstream === 'https://github.com/tdlib/td' &&
            typeof m.upstreamCommit === 'string' &&
            /^[a-f0-9]{40}$/.test(m.upstreamCommit) &&
            !isPlaceholderCommit(m.upstreamCommit) &&
            m.api === 'td-json-1.x' &&
            m.noticeReview === 'OWNER_REVIEW_REQUIRED' &&
            m.artifacts &&
            typeof m.artifacts === 'object' &&
            'tdjson.dll' in m.artifacts) {
            return 'VERIFIED';
        }
    }
    catch {
        return 'HOLD';
    }
    return 'HOLD';
}
export function requireQualifiedNativeBuild(manifestFile) {
    const status = checkNativeManifestQualification(manifestFile);
    if (status !== 'VERIFIED') {
        throw new Error('NATIVE_BUILD_HOLD');
    }
}
