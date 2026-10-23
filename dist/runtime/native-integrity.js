import { readFileSync, lstatSync, realpathSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateRoot } from './session-store.js';
/** SHA is integrity only, not evidence of provenance. This function never executes the bundle. */
export function verifyNativeBundle(manifestFile, wrapper, python, protectedRoots) {
    if (process.platform !== 'win32' || process.arch !== 'x64')
        throw new Error('NATIVE_PLATFORM_UNQUALIFIED');
    const root = validateRoot(dirname(resolve(manifestFile)), protectedRoots, true), file = resolve(manifestFile);
    if (process.platform === 'win32' && file.slice(2).includes(':'))
        throw new Error('NATIVE_MANIFEST_REJECTED');
    const st = lstatSync(file);
    if (st.isSymbolicLink() || !st.isFile() || st.size > 8192)
        throw new Error('NATIVE_MANIFEST_REJECTED');
    const raw = readFileSync(file), m = JSON.parse(raw.toString());
    if (typeof m !== 'object' || m === null)
        throw new Error('NATIVE_MANIFEST_REJECTED');
    const x = m;
    if (x.schema !== 1 || x.platform !== 'win32-x64' || x.protocol !== 1 || x.upstream !== 'https://github.com/tdlib/td' || typeof x.upstreamCommit !== 'string' || !/^[a-f0-9]{40}$/.test(x.upstreamCommit) || x.api !== 'td-json-1.x' || x.noticeReview !== 'OWNER_REVIEW_REQUIRED')
        throw new Error('NATIVE_PROVENANCE_REJECTED');
    const artifacts = x.artifacts;
    if (typeof artifacts !== 'object' || artifacts === null || Array.isArray(artifacts))
        throw new Error('NATIVE_ARTIFACT_REJECTED');
    for (const [name, sha] of Object.entries(artifacts)) {
        if (!/^[A-Za-z0-9_.-]+\.dll$/.test(name) || typeof sha !== 'string' || !/^[a-f0-9]{64}$/.test(sha))
            throw new Error('NATIVE_ARTIFACT_REJECTED');
        const p = join(root, name);
        const s = lstatSync(p);
        if (s.isSymbolicLink() || !s.isFile() || s.nlink !== 1 || s.size > 512 * 1024 * 1024)
            throw new Error('NATIVE_ARTIFACT_REJECTED');
        if (createHash('sha256').update(readFileSync(p)).digest('hex') !== sha)
            throw new Error('NATIVE_INTEGRITY_REJECTED');
    }
    for (const name of readdirSync(root)) {
        if (name.toLowerCase().endsWith('.dll') && !(name in artifacts))
            throw new Error('UNLISTED_NATIVE_DEPENDENCY');
    }
    for (const p of [resolve(python), resolve(wrapper)]) {
        const s = lstatSync(p);
        if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || realpathSync(p).toLowerCase() !== p.toLowerCase())
            throw new Error('NATIVE_EXECUTABLE_REJECTED');
    }
    if (!('tdjson.dll' in artifacts))
        throw new Error('NATIVE_DLL_REQUIRED');
    return Object.freeze({ python: resolve(python), wrapper: resolve(wrapper), dll: join(root, 'tdjson.dll'), bundleId: createHash('sha256').update(raw).digest('hex') });
}
