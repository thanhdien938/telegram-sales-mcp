"""Offline ABI/policy helper tests. No native Windows library, DPAPI or Telegram call."""
import ctypes
import importlib.util
import pathlib
import sys
import unittest
from unittest.mock import patch
ROOT = pathlib.Path(__file__).resolve().parent.parent

def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'native' / file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

bridge = module('test_bridge', 'tdjson_wrapper.py')
vault = module('test_vault', 'windows_vault.py')
class Function:
    def __init__(self, action=lambda *args: 0): self.action = action
    def __call__(self, *args): return self.action(*args)
class Library:
    td_create_client_id = Function()
    td_send = Function()
    td_receive = Function()
    td_execute = Function()

class OfflineNativeSource(unittest.TestCase):
    def test_all_write_and_auth_scope_bypasses_are_denied(self):
        for method in ['sendMessage', 'deleteMessages', 'viewMessages', 'setChatTitle', 'downloadFile', 'unknown']:
            self.assertFalse(bridge.allowed('read', method, 'fresh'))
            self.assertFalse(bridge.allowed('setup', method, 'fresh'))
        self.assertFalse(bridge.allowed('read', 'checkAuthenticationCode', 'fresh'))
        self.assertFalse(bridge.allowed('setup', 'checkAuthenticationCode', 'reopen'))
        self.assertTrue(bridge.allowed('setup', 'setTdlibParameters', 'reopen'))
    def test_json_encoder_bounded_without_native_library(self):
        self.assertIn(b'@type', bridge.encode({'@type': 'TEST_ONLY'}))
        with self.assertRaises(ValueError): bridge.encode({'data': 'x' * (bridge.MAX + 1)})
    def test_modern_c_api_signatures_bound_to_fake_library_only(self):
        fake = Library()
        with patch.object(bridge.sys, 'platform', 'win32'), patch.object(bridge.ctypes, 'CDLL', return_value=fake) as loader:
            self.assertIs(bridge.load_native('TEST_ONLY_NOT_A_REAL_DLL'), fake)
            self.assertEqual(loader.call_args.kwargs['winmode'], 0x1100)
            self.assertEqual(fake.td_create_client_id.restype, ctypes.c_int)
            self.assertEqual(fake.td_receive.restype, ctypes.c_void_p)
    def test_dpapi_mock_failure_currentuser_ui_forbidden_no_plaintext_fallback(self):
        calls = []
        crypt = type('FakeCrypt', (), {})()
        kernel = type('FakeKernel', (), {})()
        crypt.CryptProtectData = Function(lambda *args: calls.append(args[5]) or 0)
        crypt.CryptUnprotectData = Function(lambda *args: calls.append(args[5]) or 0)
        kernel.LocalFree = Function()
        with patch.object(vault.sys, 'platform', 'win32'), patch.object(vault.ctypes, 'WinDLL', side_effect=[crypt, kernel, crypt, kernel]):
            for mode in ['protect', 'unprotect']:
                with self.assertRaises(RuntimeError): vault.transform(b'TEST_ONLY', 'TEST_ONLY_CONTEXT', mode)
        self.assertEqual(calls, [1, 1])
    def test_dpapi_mock_success_zeroes_output_allocation(self):
        allocation = (ctypes.c_ubyte * 9).from_buffer_copy(b'TEST_ONLY')
        crypt = type('FakeCrypt', (), {})()
        kernel = type('FakeKernel', (), {})()
        def protect(*args):
            output = ctypes.cast(args[6], ctypes.POINTER(vault.Blob)).contents
            output.size = 9
            output.data = ctypes.cast(allocation, ctypes.POINTER(ctypes.c_ubyte))
            return 1
        crypt.CryptProtectData = Function(protect)
        kernel.LocalFree = Function()
        with patch.object(vault.sys, 'platform', 'win32'), patch.object(vault.ctypes, 'WinDLL', side_effect=[crypt, kernel]):
            self.assertEqual(vault.transform(b'TEST_ONLY', 'TEST_ONLY_CONTEXT', 'protect'), b'TEST_ONLY')
        self.assertEqual(bytes(allocation), bytes(9))

if __name__ == '__main__': unittest.main()
