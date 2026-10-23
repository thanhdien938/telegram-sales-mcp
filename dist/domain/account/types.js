export function mapAuthStateToReauth(state) {
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
export function mapAuthStateToRuntimeStatus(authState, transportStatus) {
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
