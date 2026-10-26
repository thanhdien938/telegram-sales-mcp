# Native TDLib Integration and Architecture Guide

This document describes the native integration architecture between Node.js, the Python ctypes bridge, and the Telegram Database Library (`tdjson.dll`).

## 1. Native Integration Architecture

The MCP server uses a multi-tier isolated process architecture:

```
[ MCP Client ]
       | (stdio JSON-RPC)
[ Node.js MCP Server (dist/cli.js) ]
       | (stdio JSONL transport with bounded frames)
[ Python Bridge (native/tdjson_wrapper.py) ]
       | (ctypes in-process FFI)
[ TDLib Shared Library (tdjson.dll) ]
       | (MTProto network protocol)
[ Telegram Cloud Servers ]
```

### Key Components

1. **`native/tdjson_wrapper.py`**:
   - First-party Python 3.11+ script using standard-library `ctypes` only.
   - Dynamically loads `tdjson.dll` using secure Windows DLL search flags (`LOAD_LIBRARY_SEARCH_DEFAULT_DIRS`).
   - Hooks official TDLib JSON C API methods: `td_create_client_id`, `td_send`, `td_receive`, `td_execute`.
   - Dedicated worker thread consumes updates from `td_receive` and forwards them across JSONL transport.
   - Enforces RPC whitelisting: distinguishes read-only queries from mutations. Mutations are rejected unless launched with `--enable-writes`.

2. **`native/windows_vault.py`**:
   - Encrypts and decrypts sensitive session keys at rest using Windows Data Protection API (DPAPI) via `CryptProtectData` and `CryptUnprotectData`.
   - Uses `CurrentUser` scope so keys can only be decrypted by the same Windows user on the same machine.
   - Does not store plaintext credentials or write logs to disk.

3. **`src/runtime/native-integrity.ts` & `scripts/generate-native-manifest.mjs`**:
   - Validates that the loaded DLL matches the exact file path and SHA-256 hash specified in `manifest.json` (Schema 1) in an external native bundle directory.

## 2. Obtaining or Building TDLib for Windows x64

Users can build `tdjson.dll` from upstream source or obtain a pre-built binary matching their system architecture.

### Official TDLib Source Build
1. Refer to the official [TDLib Build Instructions](https://tdlib.github.io/td/build.html?language=Python).
2. Prerequisites:
   - Visual Studio 2019/2022 (with Desktop development with C++)
   - CMake 3.18+
   - Git
   - OpenSSL (v1.1.1 or v3.0+)
   - zlib
3. Build steps summary:
   ```cmd
   git clone https://github.com/tdlib/td.git
   cd td
   git checkout v1.8.0
   mkdir build
   cd build
   cmake -A x64 -DCMAKE_BUILD_TYPE=Release -DOPENSSL_ROOT_DIR="<PATH_TO_OPENSSL>" ..
   cmake --build . --target tdjson --config Release
   ```
4. The output `tdjson.dll` will be located under `bin/Release/` or `bin/`.

### Manifest Generation
Once `tdjson.dll` is located, generate your local manifest in an external directory outside the repository (e.g. `%LOCALAPPDATA%\telegram-sales-mcp\native-bundle`):
```powershell
node scripts/generate-native-manifest.mjs `
  --dll "<PATH_TO_TDJSON_DLL>" `
  --commit "<REAL_TDLIB_COMMIT_SHA>" `
  --out "<USER_NATIVE_BUNDLE_DIR>"
```

## 3. Security and Process Supervision

- **Subprocess Isolation:** If the TDLib process or native wrapper encounters an unhandled exception or terminates unexpectedly, the Node.js process fails closed cleanly without leaking file handles.
- **Strict Frame Limits:** Standard input/output communication enforces a maximum JSON line length to prevent buffer exhaustion.
- **Log Suppression:** The wrapper automatically calls TDLib `setLogVerbosityLevel` to 0 or 1 on startup to prevent sensitive message content from leaking into standard error or debug output.
