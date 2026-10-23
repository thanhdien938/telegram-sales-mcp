import type {
  SafeErrorType,
  TdlibAuthorizationState,
  TdlibTransportLifecycleState,
} from '../../telegram/tdlib/types.js';

export type AccountRuntimeStatus =
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'reauth_required'
  | 'closing'
  | 'closed'
  | 'degraded'
  | 'failed';

export type ReauthReason =
  | 'WAIT_PHONE_NUMBER'
  | 'WAIT_EMAIL_ADDRESS'
  | 'WAIT_EMAIL_CODE'
  | 'WAIT_CODE'
  | 'WAIT_PASSWORD'
  | 'WAIT_REGISTRATION'
  | 'WAIT_OTHER_DEVICE_CONFIRMATION'
  | 'INITIALIZATION_REQUIRED'
  | 'SESSION_CLOSED'
  | 'NOT_STARTED';

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

export function mapAuthStateToReauth(
  state: TdlibAuthorizationState | 'unknown',
): ReauthStateReport {
  switch (state) {
    case 'authorizationStateReady':
      return Object.freeze({
        reauth_required: false,
        authorization_state: state,
        reason: null,
      });

    case 'authorizationStateWaitPhoneNumber':
      return Object.freeze({
        reauth_required: true,
        authorization_state: state,
        reason: 'WAIT_PHONE_NUMBER',
      });

    case 'authorizationStateWaitEmailAddress':
      return Object.freeze({
        reauth_required: true,
        authorization_state: state,
        reason: 'WAIT_EMAIL_ADDRESS',
      });

    case 'authorizationStateWaitEmailCode':
      return Object.freeze({
        reauth_required: true,
        authorization_state: state,
        reason: 'WAIT_EMAIL_CODE',
      });

    case 'authorizationStateWaitCode':
      return Object.freeze({
        reauth_required: true,
        authorization_state: state,
        reason: 'WAIT_CODE',
      });

    case 'authorizationStateWaitPassword':
      return Object.freeze({
        reauth_required: true,
        authorization_state: state,
        reason: 'WAIT_PASSWORD',
      });

    case 'authorizationStateWaitRegistration':
      return Object.freeze({
        reauth_required: true,
        authorization_state: state,
        reason: 'WAIT_REGISTRATION',
      });

    case 'authorizationStateWaitOtherDeviceConfirmation':
      return Object.freeze({
        reauth_required: true,
        authorization_state: state,
        reason: 'WAIT_OTHER_DEVICE_CONFIRMATION',
      });

    case 'authorizationStateWaitTdlibParameters':
      return Object.freeze({
        reauth_required: true,
        authorization_state: state,
        reason: 'INITIALIZATION_REQUIRED',
      });

    case 'authorizationStateLoggingOut':
    case 'authorizationStateClosing':
    case 'authorizationStateClosed':
      return Object.freeze({
        reauth_required: false,
        authorization_state: state,
        reason: 'SESSION_CLOSED',
      });

    case 'unknown':
    default:
      return Object.freeze({
        reauth_required: false,
        authorization_state: 'unknown',
        reason: null,
      });
  }
}

export function mapAuthStateToRuntimeStatus(
  authState: TdlibAuthorizationState | 'unknown',
  transportStatus?: TdlibTransportLifecycleState,
): AccountRuntimeStatus {
  if (transportStatus === 'failed') {
    return 'failed';
  }
  if (transportStatus === 'stopped') {
    return 'stopped';
  }
  if (transportStatus === 'stopping') {
    return 'closing';
  }
  if (transportStatus === 'closed') {
    return 'closed';
  }

  switch (authState) {
    case 'authorizationStateReady':
      return 'ready';
    case 'authorizationStateWaitPhoneNumber':
    case 'authorizationStateWaitEmailAddress':
    case 'authorizationStateWaitEmailCode':
    case 'authorizationStateWaitCode':
    case 'authorizationStateWaitPassword':
    case 'authorizationStateWaitRegistration':
    case 'authorizationStateWaitOtherDeviceConfirmation':
      return 'reauth_required';
    case 'authorizationStateLoggingOut':
    case 'authorizationStateClosing':
      return 'closing';
    case 'authorizationStateClosed':
      return 'closed';
    case 'authorizationStateWaitTdlibParameters':
      return 'starting';
    case 'unknown':
    default:
      return transportStatus === 'running' ? 'starting' : 'stopped';
  }
}
