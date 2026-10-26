"""First-party generic JSON bridge for reviewed TDLib 1.x C JSON ABI. No DLL is bundled.
No arbitrary RPC: read whitelist and mode-limited setup RPCs enforced before td_send.
"""
import argparse
import ctypes
import json
import os
import queue
import sys
import threading
import time

READ = frozenset(['getAuthorizationState', 'getMe', 'loadChats', 'getChats', 'getChat',
 'getChatHistory', 'getMessage', 'searchChatMessages', 'searchMessages', 'searchPublicChat',
 'searchPublicChats', 'searchPublicPosts', 'searchPublicMessagesByTag', 'searchContacts',
 'getUser', 'getFile', 'getBasicGroup', 'getSupergroup', 'getSupergroupFullInfo',
 'getBasicGroupFullInfo', 'getChatMember', 'getSupergroupMembers', 'getChatAdministrators', 'close'])
WRITE = frozenset(['sendMessage', 'sendMessageAlbum', 'editMessageText', 'editMessageCaption',
 'deleteMessages', 'forwardMessages', 'addMessageReaction', 'removeMessageReaction',
 'pinChatMessage', 'unpinChatMessage', 'viewMessages', 'setMessageSchedulingState', 'downloadFile'])
AUTH = frozenset(['setTdlibParameters', 'setAuthenticationPhoneNumber', 'checkAuthenticationCode', 'checkAuthenticationPassword'])
MAX = 1024 * 1024
EXPECTED = {'setTdlibParameters':'authorizationStateWaitTdlibParameters','setAuthenticationPhoneNumber':'authorizationStateWaitPhoneNumber','checkAuthenticationCode':'authorizationStateWaitCode','checkAuthenticationPassword':'authorizationStateWaitPassword'}

def allowed(scope, method, mode, writes_enabled=False):
    if scope == 'read': return method in READ
    if scope == 'write': return writes_enabled and method in WRITE
    return scope == 'setup' and method in AUTH and (mode == 'fresh' or method == 'setTdlibParameters')

def encode(value):
    result = json.dumps(value, ensure_ascii=True, separators=(',', ':')).encode('utf-8')
    if len(result) > MAX: raise ValueError('FRAME_LIMIT')
    return result

def load_native(path):
    if sys.platform != 'win32' or ctypes.sizeof(ctypes.c_void_p) != 8: raise RuntimeError('PLATFORM_HOLD')
    dll = ctypes.CDLL(os.path.abspath(path), winmode=0x1100)
    dll.td_create_client_id.argtypes = []
    dll.td_create_client_id.restype = ctypes.c_int
    dll.td_send.argtypes = [ctypes.c_int, ctypes.c_char_p]
    dll.td_send.restype = None
    dll.td_receive.argtypes = [ctypes.c_double]
    dll.td_receive.restype = ctypes.c_void_p
    dll.td_execute.argtypes = [ctypes.c_char_p]
    dll.td_execute.restype = ctypes.c_void_p
    return dll

def read_pointer(pointer):
    if not pointer: raise ValueError('NATIVE_POINTER_EMPTY')
    result = bytearray()
    for offset in range(MAX + 1):
        char = ctypes.c_ubyte.from_address(pointer + offset).value
        if char == 0: return bytes(result)
        result.append(char)
    raise ValueError('NATIVE_FRAME_LIMIT')


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--dll', required=True)
    parser.add_argument('--mode', choices=['fresh', 'reopen'], required=True)
    parser.add_argument('--enable-writes', action='store_true', default=False)
    args = parser.parse_args()
    dll = load_native(args.dll)
    # Disable log stream before creating a client; stderr must never carry native content.
    log_result = dll.td_execute(encode({'@type': 'setLogStream', 'log_stream': {'@type': 'logStreamEmpty'}}))
    if json.loads(read_pointer(log_result)).get('@type') != 'ok': raise RuntimeError('LOG_DISABLE_FAILED')
    client = dll.td_create_client_id()
    if client <= 0: raise RuntimeError('CLIENT_FAILED')
    incoming = queue.Queue(maxsize=32)
    def stdin_reader():
        try:
            while True:
                line = sys.stdin.buffer.readline(MAX + 2)
                if not line: incoming.put(None, timeout=1); return
                if len(line) > MAX or not line.endswith(b'\n'): raise ValueError('FRAME_LIMIT')
                value = json.loads(line)
                if not isinstance(value, dict): raise ValueError('FRAME_OBJECT')
                incoming.put(value, timeout=1)
        except Exception:
            try: incoming.put(False, timeout=1)
            except queue.Full: pass
    threading.Thread(target=stdin_reader, daemon=True).start()
    pending = set()
    auth_state = None
    ever_ready = False
    closing = False
    deadline = None
    def emit(value):
        sys.stdout.buffer.write(encode(value) + b'\n')
        sys.stdout.buffer.flush()
    emit({'kind': 'ready', 'protocol': 1})
    # Kick the official client without a Telegram write; updates begin after first request.
    dll.td_send(client, encode({'@type': 'getAuthorizationState'}))
    while True:
        try: message = incoming.get_nowait()
        except queue.Empty: message = 'WAIT'
        if message is None:
            if not closing:
                closing = True; deadline = time.monotonic() + 1.5
                dll.td_send(client, encode({'@type': 'close'}))
        elif message is False: raise ValueError('FRAME_REJECTED')
        elif isinstance(message, dict):
            body = message.get('payload'); ident = message.get('id')
            if closing or message.get('kind') != 'request' or not isinstance(body, dict) or not isinstance(ident, str) or not 1 <= len(ident) <= 128 or ident in pending or len(pending) >= 32 or not allowed(message.get('scope'), body.get('@type'), args.mode, args.enable_writes): raise ValueError('RPC_REJECTED')
            if message.get('scope') == 'setup' and (ever_ready or EXPECTED.get(body.get('@type')) != auth_state): raise ValueError('AUTH_PHASE_REJECTED')
            if message.get('scope') in ['read', 'write'] and body.get('@type') not in ['getAuthorizationState','close'] and auth_state != 'authorizationStateReady': raise ValueError('NOT_READY')
            pending.add(ident)
            body = dict(body); body['@extra'] = ident
            dll.td_send(client, encode(body))
        pointer = dll.td_receive(0.05)
        if pointer:
            # Read at most MAX+1 bytes through NUL; do not print malformed/error content.
            data = read_pointer(pointer)
            if len(data) > MAX: raise ValueError('NATIVE_FRAME_LIMIT')
            body = json.loads(data)
            if not isinstance(body, dict) or not isinstance(body.get('@type'), str): raise ValueError('NATIVE_FRAME_OBJECT')
            if body.get('@client_id') != client: raise ValueError('CLIENT_MIX_REJECTED')
            observed = body.get('authorization_state', {}) if body.get('@type') == 'updateAuthorizationState' else body if body.get('@type', '').startswith('authorizationState') else {}
            if observed:
                auth_state = observed.get('@type')
                if auth_state == 'authorizationStateReady': ever_ready = True
            extra = body.pop('@extra', None)
            if extra is not None:
                if extra in pending:
                    pending.remove(extra)
                    if body.get('@type') == 'error':
                        code = body.get('code') if isinstance(body.get('code'), int) and 100 <= body['code'] <= 599 else 400
                        body = {'@type':'error','message':str(code),'code':code}
                    emit({'kind': 'response', 'id': extra, 'payload': body})
            else:
                if body.get('@type', '').startswith('authorizationState'): body = {'@type':'updateAuthorizationState','authorization_state':body}
                emit({'kind': 'update', 'payload': body})
            if body.get('@type') == 'updateAuthorizationState' and body.get('authorization_state', {}).get('@type') == 'authorizationStateClosed': return
        if closing and time.monotonic() >= deadline: return

if __name__ == '__main__':
    try: main()
    except BaseException:
        sys.stderr.write('NATIVE_BRIDGE_FAILED\n')
        sys.exit(1)
