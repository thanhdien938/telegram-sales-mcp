import { readFileSync, statSync } from 'node:fs';
import { ApprovedMediaRegistry, } from './approved-media-registry.js';
/**
 * Operator-only local media staging. The model never supplies a filesystem
 * path: it only ever sees the opaque `media_ref` keys of this manifest. The
 * manifest itself is read once at process startup from a path the operator
 * controls via TELEGRAM_SINGLE_USER_MEDIA_CATALOG; a bad or tampered entry
 * fails startup loudly instead of silently granting a wrong target.
 *
 * Example manifest JSON:
 * {
 *   "launch_photo_1": { "kind": "photo", "local_path": "C:\\staging\\launch.jpg", "width": 1280, "height": 720 },
 *   "spec_sheet_1":   { "kind": "document", "local_path": "C:\\staging\\spec-sheet.pdf" },
 *   "legacy_doc_1":   { "kind": "document", "tdlib_file_id": 123456 }
 * }
 */
const CATALOG_ENV = 'TELEGRAM_SINGLE_USER_MEDIA_CATALOG';
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
function extensionOf(path) {
    const dot = path.lastIndexOf('.');
    const sep = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
    if (dot <= sep)
        return '';
    return path.slice(dot).toLowerCase();
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function parseEntry(ref, raw) {
    if (!isRecord(raw) || (raw.kind !== 'photo' && raw.kind !== 'document'))
        throw new Error(`${CATALOG_ENV}: entry "${ref}" must have kind "photo" or "document"`);
    if (typeof raw.tdlib_file_id === 'number') {
        if (raw.local_path !== undefined)
            throw new Error(`${CATALOG_ENV}: entry "${ref}" cannot set both tdlib_file_id and local_path`);
        if (raw.kind === 'document')
            return { kind: 'document', tdlibFileId: raw.tdlib_file_id };
        if (typeof raw.width !== 'number' ||
            typeof raw.height !== 'number')
            throw new Error(`${CATALOG_ENV}: entry "${ref}" requires width/height for a photo`);
        return {
            kind: 'photo',
            tdlibFileId: raw.tdlib_file_id,
            width: raw.width,
            height: raw.height,
        };
    }
    if (typeof raw.local_path !== 'string' || raw.local_path.length === 0)
        throw new Error(`${CATALOG_ENV}: entry "${ref}" must set exactly one of tdlib_file_id or local_path`);
    const path = raw.local_path;
    let stat;
    try {
        stat = statSync(path);
    }
    catch {
        throw new Error(`${CATALOG_ENV}: entry "${ref}" local_path does not exist or is not readable`);
    }
    if (!stat.isFile())
        throw new Error(`${CATALOG_ENV}: entry "${ref}" local_path must be a regular file`);
    const maxBytes = raw.kind === 'photo' ? MAX_PHOTO_BYTES : MAX_DOCUMENT_BYTES;
    if (stat.size <= 0 || stat.size > maxBytes)
        throw new Error(`${CATALOG_ENV}: entry "${ref}" file size ${String(stat.size)} bytes is out of bounds (max ${String(maxBytes)})`);
    if (raw.kind === 'photo') {
        if (!PHOTO_EXTENSIONS.has(extensionOf(path)))
            throw new Error(`${CATALOG_ENV}: entry "${ref}" local_path extension does not look like a photo (expected jpg/jpeg/png/webp)`);
        if (typeof raw.width !== 'number' || typeof raw.height !== 'number')
            throw new Error(`${CATALOG_ENV}: entry "${ref}" requires width/height for a photo`);
        return {
            kind: 'photo',
            localPath: path,
            width: raw.width,
            height: raw.height,
        };
    }
    return { kind: 'document', localPath: path };
}
/**
 * Loads and validates the opt-in local media catalog from env. Returns
 * undefined when unset (the default: no media registry entries at all, so
 * SEND_MEDIA/SCHEDULE_MEDIA deny with INVALID_ARGUMENT "Unknown media
 * reference" rather than silently succeeding). Never logs the manifest path
 * or file contents.
 */
export function loadMediaCatalogFromEnv(env = process.env) {
    const manifestPath = env[CATALOG_ENV];
    if (typeof manifestPath !== 'string' || manifestPath.trim().length === 0)
        return undefined;
    let raw;
    try {
        raw = readFileSync(manifestPath, 'utf8');
    }
    catch {
        throw new Error(`${CATALOG_ENV} path could not be read`);
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error(`${CATALOG_ENV} does not contain valid JSON`);
    }
    if (!isRecord(parsed))
        throw new Error(`${CATALOG_ENV} must contain a JSON object of media_ref entries`);
    const registry = new ApprovedMediaRegistry();
    for (const [ref, entry] of Object.entries(parsed)) {
        registry.approve(ref, parseEntry(ref, entry));
    }
    return registry;
}
