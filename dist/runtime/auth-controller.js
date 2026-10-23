export async function authenticate(setup, context, secrets, signal) {
    const seen = new Set();
    for (let steps = 0; steps < 8; steps++) {
        if (signal?.aborted)
            throw new Error('AUTH_CANCELLED');
        const state = await setup.waitState(signal);
        if (signal?.aborted)
            throw new Error('AUTH_CANCELLED');
        if (seen.has(state))
            throw new Error('AUTH_RETRY_FORBIDDEN');
        seen.add(state);
        if (state === 'authorizationStateReady')
            return context.readIdentity();
        if (state === 'authorizationStateWaitTdlibParameters') {
            await setup.request('setTdlibParameters', { use_test_dc: false, database_directory: context.databaseDirectory, files_directory: context.filesDirectory, database_encryption_key: context.credentials.databaseKey, use_file_database: true, use_chat_info_database: true, use_message_database: true, use_secret_chats: false, api_id: context.credentials.apiId, api_hash: context.credentials.apiHash, system_language_code: 'en', device_model: 'Desktop', system_version: 'Windows', application_version: '1.0.0-beta.2' });
            continue;
        }
        if (context.mode !== 'fresh' || !secrets)
            throw new Error('REAUTH_REQUIRED_USE_PRIVATE_TERMINAL');
        if (state === 'authorizationStateWaitPhoneNumber') {
            const phone = await secrets.read('phone', signal);
            if (!/^\+[1-9]\d{7,14}$/.test(phone))
                throw new Error('PHONE_FORMAT_REJECTED');
            if (signal?.aborted)
                throw new Error('AUTH_CANCELLED');
            await setup.request('setAuthenticationPhoneNumber', { phone_number: phone });
        }
        else if (state === 'authorizationStateWaitCode') {
            const code = await secrets.read('code', signal);
            if (!/^\d{1,12}$/.test(code))
                throw new Error('CODE_FORMAT_REJECTED');
            if (signal?.aborted)
                throw new Error('AUTH_CANCELLED');
            await setup.request('checkAuthenticationCode', { code });
        }
        else if (state === 'authorizationStateWaitPassword') {
            const password = await secrets.read('password', signal);
            if (!password || password.length > 4096)
                throw new Error('PASSWORD_FORMAT_REJECTED');
            if (signal?.aborted)
                throw new Error('AUTH_CANCELLED');
            await setup.request('checkAuthenticationPassword', { password });
        }
        else
            throw new Error('AUTH_STATE_UNSUPPORTED');
    }
    throw new Error('AUTH_STEP_LIMIT');
}
export async function readApiCredentials(secrets, signal) {
    const apiId = Number(await secrets.read('api_id', signal)), apiHash = await secrets.read('api_hash', signal);
    if (signal?.aborted)
        throw new Error('AUTH_CANCELLED');
    if (!Number.isSafeInteger(apiId) || apiId <= 0 || apiId > 2 ** 31 - 1 || !/^[a-f0-9]{32}$/i.test(apiHash))
        throw new Error('API_INPUT_REJECTED');
    return { apiId, apiHash };
}
