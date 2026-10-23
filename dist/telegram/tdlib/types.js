export const TDLIB_AUTH_STATES = [
    'authorizationStateWaitTdlibParameters',
    'authorizationStateWaitPhoneNumber',
    'authorizationStateWaitEmailAddress',
    'authorizationStateWaitEmailCode',
    'authorizationStateWaitCode',
    'authorizationStateWaitOtherDeviceConfirmation',
    'authorizationStateWaitRegistration',
    'authorizationStateWaitPassword',
    'authorizationStateReady',
    'authorizationStateLoggingOut',
    'authorizationStateClosing',
    'authorizationStateClosed',
];
export function isTdlibAuthorizationState(value) {
    return (typeof value === 'string' &&
        TDLIB_AUTH_STATES.includes(value));
}
export function parseSafeAccountIdentity(response) {
    if (typeof response !== 'object' || response === null) {
        return Object.freeze({
            own_identity_read: false,
            user_object_type: 'unknown',
            user_id_present: false,
            is_bot: null,
        });
    }
    const record = response;
    if (record['@type'] !== 'user') {
        return Object.freeze({
            own_identity_read: false,
            user_object_type: 'unknown',
            user_id_present: false,
            is_bot: null,
        });
    }
    const userIdPresent = typeof record.id === 'number' || typeof record.id === 'string';
    let isBot = null;
    const userType = record.type;
    if (typeof userType === 'object' && userType !== null) {
        const typeRecord = userType;
        if (typeRecord['@type'] === 'userTypeBot') {
            isBot = true;
        }
        else if (typeRecord['@type'] === 'userTypeRegular') {
            isBot = false;
        }
    }
    return Object.freeze({
        own_identity_read: true,
        user_object_type: 'user',
        user_id_present: userIdPresent,
        is_bot: isBot,
    });
}
