"""CurrentUser DPAPI private pipe helper. No plaintext argv, stderr or fallback."""
import base64
import ctypes
import hashlib
import json
import sys
from ctypes import wintypes

class Blob(ctypes.Structure):
    _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]

def blob(data):
    backing = (ctypes.c_ubyte * len(data)).from_buffer_copy(data)
    return Blob(len(data), backing), backing

def transform(value, context, mode):
    if sys.platform != 'win32': raise RuntimeError('WINDOWS_DPAPI_REQUIRED')
    crypt = ctypes.WinDLL('crypt32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    source, source_backing = blob(value)
    entropy, entropy_backing = blob(hashlib.sha256(context.encode('utf-8')).digest())
    output = Blob()
    try:
        if mode == 'protect':
            fn = crypt.CryptProtectData
            fn.argtypes = [ctypes.POINTER(Blob), wintypes.LPCWSTR, ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
            fn.restype = wintypes.BOOL
            ok = fn(ctypes.byref(source), None, ctypes.byref(entropy), None, None, 1, ctypes.byref(output))
        else:
            fn = crypt.CryptUnprotectData
            fn.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
            fn.restype = wintypes.BOOL
            ok = fn(ctypes.byref(source), None, ctypes.byref(entropy), None, None, 1, ctypes.byref(output))
        if not ok or output.size > 32768: raise RuntimeError('DPAPI_FAILED')
        return ctypes.string_at(output.data, output.size)
    finally:
        ctypes.memset(source_backing, 0, len(source_backing))
        ctypes.memset(entropy_backing, 0, len(entropy_backing))
        if output.data:
            ctypes.memset(output.data, 0, output.size)
            kernel.LocalFree(output.data)

def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ['protect', 'unprotect']: raise ValueError('MODE_REJECTED')
    line = sys.stdin.buffer.read(65537)
    if len(line) > 65536: raise ValueError('PAYLOAD_LIMIT')
    request = json.loads(line)
    if not isinstance(request, dict) or not isinstance(request.get('context'), str) or len(request['context']) > 4096: raise ValueError('CONTEXT_REJECTED')
    value = base64.b64decode(request['value'], validate=True)
    if not 0 < len(value) <= 32768: raise ValueError('VALUE_LIMIT')
    result = transform(value, request['context'], sys.argv[1])
    sys.stdout.write(json.dumps({'value': base64.b64encode(result).decode('ascii')}))

if __name__ == '__main__':
    try: main()
    except BaseException:
        sys.stderr.write('DPAPI_FAILED\n')
        sys.exit(1)
