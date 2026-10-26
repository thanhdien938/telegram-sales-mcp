# Windows Installation and Configuration Guide

This guide describes how to install, configure, and operate the Telegram Sales MCP server on Windows x64 with full 33-tool parity.

## 1. System Requirements

- **OS:** Windows 10 or 11 (64-bit x64 architecture).
- **Node.js:** v22.19.0 or higher.
- **Python:** v3.11+ 64-bit (standard CPython with standard `ctypes` library).
- **TDLib:** 64-bit `tdjson.dll` compiled from the [official TDLib repository](https://github.com/tdlib/td) or downloaded from trusted releases.
- **Telegram Account:** An active Telegram account with API credentials (`api_id` and `api_hash`) obtained from [my.telegram.org](https://my.telegram.org).

## 2. Clone and Offline Verification

Clone the repository and install runtime dependencies:

```powershell
git clone https://github.com/thanhdien938/telegram-sales-mcp.git
cd telegram-sales-mcp

# Install dependencies and build TypeScript code
npm ci --ignore-scripts --userconfig .npmrc --globalconfig config/npm-globalrc
npm run build

# Run offline regression test suite (42 tests)
npm run test:offline
```

## 3. Run Environment Diagnostics

Run the built-in diagnostic tool to check your environment:

```powershell
npm run doctor
```

The doctor command verifies:
- Node.js runtime and architecture
- Python 64-bit executable availability
- Native TDLib manifest and DLL integrity
- Session state directory and writer lock
- Sales CRM SQLite database and consent marker
- Outbound write opt-in configuration

## 4. TDLib Native Manifest Generation

The native bridge requires a Schema 1 JSON manifest referencing your local `tdjson.dll` with its verified SHA-256 checksum and official TDLib Git commit. The output directory must be an external folder outside the repository (such as `%LOCALAPPDATA%\telegram-sales-mcp\native-bundle`):

```powershell
node scripts/generate-native-manifest.mjs `
  --dll "<PATH_TO_TDJSON_DLL>" `
  --commit "<REAL_TDLIB_COMMIT_SHA>" `
  --out "<USER_NATIVE_BUNDLE_DIR>"
```

This command validates your TDLib DLL, copies it to `<USER_NATIVE_BUNDLE_DIR>\tdjson.dll`, and writes `<USER_NATIVE_BUNDLE_DIR>\manifest.json` with the exact file path, SHA-256 hash, and upstream commit SHA.

## 5. Account Authentication (Private Terminal Login)

Run the interactive terminal login in a dedicated PowerShell window:

```powershell
node dist/login.js --state "<ABSOLUTE_STATE_DIR>" --native-manifest "<ABSOLUTE_MANIFEST_PATH>" --python "<PYTHON_EXE>"
```

During login:
1. You will be prompted for your Telegram `api_id` and `api_hash`.
2. Enter your phone number in international format (`+country_code_number`).
3. Enter the Telegram OTP verification code received on your devices or SMS.
4. Enter your Two-Factor Authentication (2FA) cloud password if enabled.
5. All sensitive input is hidden (no terminal echo). Telegram API credentials and session encryption keys are encrypted at rest using Windows DPAPI (`CurrentUser` scope) and stored in `<STATE_DIR>/vault.bin`; `<STATE_DIR>/session.json` contains account and session binding metadata without exposing raw secrets.

## 6. Initialize Local Sales CRM

Initialize a dedicated directory for your SQLite CRM database:

```powershell
node dist/crm-init.js "<ABSOLUTE_CRM_DIR>"
```

Follow the interactive prompt to type the acknowledgment. This creates `sales.sqlite` and the required consent marker.

## 7. Launch MCP Server (33-Tool Mode)

To expose all 33 tools (11 Read + 13 Action + 9 CRM), launch the stdio MCP server with both CRM and write options enabled:

```powershell
node dist/cli.js `
  --crm "<ABSOLUTE_CRM_DIR>" `
  --state "<ABSOLUTE_STATE_DIR>" `
  --native-manifest "<ABSOLUTE_MANIFEST_PATH>" `
  --python "<PYTHON_EXE>" `
  --writes `
  --chat-id "<TARGET_CHAT_ID>"
```

### Environment Variable Alternative
You can also configure the server via environment variables:
```powershell
$env:TELEGRAM_SINGLE_USER_WRITES = "1"
$env:TELEGRAM_SINGLE_USER_CHAT_ID = "<TARGET_CHAT_ID>"
node dist/cli.js --crm "<ABSOLUTE_CRM_DIR>" --state "<ABSOLUTE_STATE_DIR>" --native-manifest "<ABSOLUTE_MANIFEST_PATH>" --python "<PYTHON_EXE>"
```

## 8. MCP Client Configuration Example

For desktop MCP clients (such as Claude Desktop or Roo Code / Cline), configure the stdio server entry:

```json
{
  "mcpServers": {
    "telegram-sales": {
      "command": "node",
      "args": [
        "<PATH_TO_PROJECT>/dist/cli.js",
        "--crm", "<ABSOLUTE_CRM_DIR>",
        "--state", "<ABSOLUTE_STATE_DIR>",
        "--native-manifest", "<ABSOLUTE_MANIFEST_PATH>",
        "--python", "<PYTHON_EXE>",
        "--writes",
        "--chat-id", "<TARGET_CHAT_ID>"
      ]
    }
  }
}
```
