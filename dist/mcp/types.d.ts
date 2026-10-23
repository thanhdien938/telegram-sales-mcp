import type { AccountRuntimeStatus, ReauthReason } from '../domain/index.js';
export interface SafeAccountRuntimeSummary {
    readonly runtime_status: AccountRuntimeStatus;
    readonly authorization_state: string;
    readonly authenticated: boolean;
    readonly reauth_required: boolean;
    readonly own_identity_available: boolean;
    readonly transport_status: string;
    readonly last_error_type: string | null;
}
export interface TelegramHealthResult {
    readonly native_build_status?: 'HOLD' | 'VERIFIED';
    readonly ok: boolean;
    readonly service: string;
    readonly phase: string;
    readonly mcp_transport_status: string;
    readonly telegram_provider_status: string;
    readonly bot_provider_status: string;
    readonly write_capabilities_enabled: boolean;
    readonly account_runtime?: SafeAccountRuntimeSummary | undefined;
}
export interface TelegramCapabilitiesResult {
    readonly native_build_status?: 'HOLD' | 'VERIFIED';
    readonly mcp_foundation: boolean;
    readonly streamable_http: boolean;
    readonly telegram_user_runtime: boolean;
    readonly authenticated_account: boolean;
    readonly telegram_reads: boolean;
    readonly telegram_writes: boolean;
    readonly bot_api: boolean;
    readonly telegram_business: boolean;
    readonly sales_local: boolean;
    readonly integrations: boolean;
    readonly write_classes_enabled: readonly string[];
    readonly next_phase: string;
}
export interface TelegramAccountResult {
    readonly ok: boolean;
    readonly runtime_status: AccountRuntimeStatus;
    readonly authorization_state: string;
    readonly authenticated: boolean;
    readonly reauth_required: boolean;
    readonly reauth_reason: ReauthReason | null;
    readonly own_identity_read: boolean;
    readonly own_identity_available: boolean;
    readonly user_object_type: 'user' | 'unknown';
    readonly user_id_present: boolean;
    readonly is_bot: boolean | null;
    readonly transport_status: string;
    readonly update_supervisor_running: boolean;
    readonly pending_request_count: number;
    readonly update_count: number;
    readonly last_error_type: string | null;
}
