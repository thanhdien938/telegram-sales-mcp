# Third-party notices

The MIT LICENSE at the root covers first-party source only, authorized for this source export by the repository owner. It does not relicense dependencies, TDLib, native executables, or external assets.

## 1. Node.js Dependencies

Direct runtime dependencies are `@modelcontextprotocol/sdk` and `zod`; direct development dependencies are TypeScript and Node.js typings. See `package-lock.json` for exact resolved versions, integrity, and package metadata:
- `@modelcontextprotocol/sdk`: MIT License
- `zod`: MIT License
- `typescript`: Apache-2.0 License
- `@types/node`: MIT License

The resolved lock contains 99 records including the root (MIT: 88, ISC: 7, BSD-3-Clause: 2, BSD-2-Clause: 1, Apache-2.0: 1). All dependencies retain their original upstream licenses. npm lifecycle scripts are disabled during installation (`--ignore-scripts`). No pre-installed `node_modules` tree is redistributed with this source repository.

## 2. Upstream TDLib and Native Binaries Notice

This repository is distributed as **source-only** and does **not** include pre-compiled TDLib binaries or DLLs (`tdjson.dll`). Users obtain or build their own native libraries:

- **Upstream TDLib Source:**
  - Upstream project: [Telegram Database Library (TDLib)](https://github.com/tdlib/td)
  - Copyright (c) 2014-2026 Telegram Messenger Inc.
  - License: Boost Software License 1.0 (BSL-1.0)
  - Permissions and obligations: BSL-1.0 permits use, modification, and redistribution. Derivative source works must include the copyright notice and license text; object code generated from the source does not require notice reproduction.

- **Third-Party Prebuilt Packaging Reference (NuGet `tdlib.native.win-x64`):**
  - If users choose to obtain pre-built Windows x64 DLLs from the public NuGet ecosystem, the independent open-source package [`tdlib.native.win-x64`](https://www.nuget.org/packages/tdlib.native.win-x64/) (maintained by ForNeVeR) packages TDLib binaries for Windows:
    - Package License: Apache-2.0 / Boost Software License 1.0
    - Transitive runtime DLLs bundled in that package include:
      - `tdjson.dll`: TDLib JSON interface (Boost Software License 1.0)
      - `libcrypto-3-x64.dll` & `libssl-3-x64.dll`: OpenSSL Project (Apache License 2.0)
      - `z.dll`: zlib compression library (zlib License, Jean-loup Gailly and Mark Adler)
  - **Attribution & Provenance Notice:** The `tdlib.native.win-x64` NuGet package is a third-party open-source build, not an official binary distributed directly by the core Telegram team. Users must generate an external Schema 1 manifest (`scripts/generate-native-manifest.mjs`) recording the upstream Git commit and SHA-256 integrity hash of their chosen binary.

## 3. First-Party Native Bridges

The Python bridge scripts (`native/tdjson_wrapper.py` and `native/windows_vault.py`) are first-party source code licensed under MIT:
- They interface with standard OS facilities (Windows DPAPI via standard CPython `ctypes`) and the official TDLib JSON C API (`td_create_client_id`, `td_send`, `td_receive`, `td_execute`).
- No private sidecar binaries or proprietary encryption modules are distributed.

## 4. Unofficial Project Notice

This project is an unofficial community integration and is neither affiliated with nor endorsed by Telegram. All trademarks, service marks, and trade names are the property of their respective owners.
