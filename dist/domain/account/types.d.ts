import type { SafeErrorType, TdlibAuthorizationState, TdlibTransportLifecycleState } from '../../telegram/tdlib/types.js';
export type AccountRuntimeStatus = 'stopped' | 'starting' | 'ready' | 'reauth_required' | 'closing' | 'closed' | 'degraded' | 'failed';
export type ReauthReason = 'WAIT_PHONE_NUMBER' | 'WAIT_EMAIL_ADDRESS' | 'WAIT_EMAIL_CODE' | 'WAIT_CODE' | 'WAIT_PASSWORD' | 'WAIT_REGISTRATION' | 'WAIT_OTHER_DEVICE_CONFIRMATION' | 'INITIALIZATION_REQUIRED' | 'SESSION_CLOSED' | 'NOT_STARTED';
export interface ReauthStateReport {
    readonly reauth_required: boolean;
    readonly authorization_state: TdlibAuthorizationState | 'unknown';
    readonly reason: ReauthReason | null;
}
export interface AccountSnapshot {
    readonly authorization_state: TdlibAuthorizationState | 'unknown';
    readonly runtime_status: AccountRuntimeStatus;
    readonly own_identity_read: boolean;
    readonly user_object_type: 'user' | 'unknown';
    readonly user_id_present: boolean;
    readonly is_bot: boolean | null;
}
export interface AccountRuntimeHealth {
    readonly runtime_status: AccountRuntimeStatus;
    readonly transport_status: TdlibTransportLifecycleState;
    readonly authorization_state: TdlibAuthorizationState | 'unknown';
    readonly authenticated: boolean;
    readonly reauth_required: boolean;
    readonly own_identity_available: boolean;
    readonly update_supervisor_running: boolean;
    readonly pending_request_count: number;
    readonly update_count: number;
    readonly last_error_type: SafeErrorType | null;
}
export declare function mapAuthStateToReauth(state: TdlibAuthorizationState | 'unknown'): ReauthStateReport;
export declare function mapAuthStateToRuntimeStatus(authState: TdlibAuthorizationState | 'unknown', transportStatus?: TdlibTransportLifecycleState): AccountRuntimeStatus;
