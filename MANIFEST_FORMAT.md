# Canonical export checksum

Manifest schema 2 hashes distributable regular files, including hidden/config/docs/source/test/native Python/dist files. It excludes EXPORT_MANIFEST.json itself (no circular hash), and generated root node_modules, .npm-cache and .qa trees. Final handoff removes those generated trees. Git history, links/hardlinks and private state are rejected by manifest/privacy checks, not silently exported.

Paths are candidate-relative, POSIX forward slash, normalized to Unicode NFC, and sorted lexicographically by their UTF-8 bytes (case-sensitive; no Windows Path ordering). Each record is UTF-8(path) followed by one U+0000 byte, 64 lowercase hexadecimal SHA256 characters of raw file bytes, and one LF byte. Concatenate records with no other separator/header/BOM and SHA256 the result. Per-file hashing does not normalize CRLF, encoding or content. The final LF is included. Manifest fields store the algorithm, file list/count and tree hash; its own hash is separately reported privately.

After any authorized edit/build/doc change, run `node scripts/refresh-manifest.mjs`, then `node scripts/verify-manifest.mjs` and `node scripts/verify-export.mjs`. Do not confuse refreshing a hash with authorizing source or proving QA/provenance; verification status fields are worker evidence labels for independent review, not native certification.

Independent implementations must use the above byte algorithm rather than platform-dependent filename sorting or text line conversion. No root path, credential or user/session fingerprint is part of this digest.
