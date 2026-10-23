import { assertReadRpc } from '../policy/read-only.js';
const AUTH = new Set(['setTdlibParameters', 'setAuthenticationPhoneNumber', 'checkAuthenticationCode', 'checkAuthenticationPassword']);
export function assertNativeRpc(scope, method, mode) {
    if (scope === 'read') {
        assertReadRpc(method);
        return;
    }
    if (typeof method !== 'string' || !AUTH.has(method) || (mode === 'reopen' && method !== 'setTdlibParameters'))
        throw new Error('PRIVATE_AUTH_RPC_REJECTED');
}
export const NATIVE_BUILD_STATUS = 'HOLD';
export function requireQualifiedNativeBuild() {
    if (NATIVE_BUILD_STATUS !== 'VERIFIED')
        throw new Error('NATIVE_BUILD_HOLD');
}
