import { closeSync, existsSync, lstatSync, openSync, readSync } from 'node:fs';
import { DomainError } from '../common/errors.js';
import { parseAndValidateSafeInt32Id } from '../common/id-validator.js';
import { MAX_FILE_CONTENT_BYTES, } from './types.js';
export class FileService {
    adapter;
    fsExists;
    fsLstat;
    fsOpen;
    fsRead;
    fsClose;
    constructor(adapter, fsSeam) {
        this.adapter = adapter;
        this.fsExists = fsSeam?.existsSync ?? existsSync;
        this.fsLstat = fsSeam?.lstatSync ?? lstatSync;
        this.fsOpen = fsSeam?.openSync ?? openSync;
        this.fsRead = fsSeam?.readSync ?? readSync;
        this.fsClose = fsSeam?.closeSync ?? closeSync;
    }
    async getFile(options) {
        const rawFileId = options.fileId ?? options.file_id;
        if (typeof rawFileId !== 'string') {
            throw new DomainError('INVALID_ID', 'file_id must be a string representation of a decimal integer');
        }
        const validatedId = parseAndValidateSafeInt32Id(rawFileId, 'file_id');
        if (options.mode === 'metadata') {
            return this.getFileMetadata(validatedId.numberId, validatedId.stringId);
        }
        else {
            return this.getFileContent(validatedId.numberId, validatedId.stringId, options);
        }
    }
    async getFileMetadata(fileId, fileIdStr) {
        const raw = await this.adapter.getFile(fileId);
        const size = typeof raw.size === 'number' ? raw.size : 0;
        const expectedSize = typeof raw.expected_size === 'number' ? raw.expected_size : size;
        const local = typeof raw.local === 'object' && raw.local !== null
            ? raw.local
            : null;
        const isDownloaded = local?.is_downloading_completed === true;
        const downloadedSize = typeof local?.downloaded_size === 'number' ? local.downloaded_size : 0;
        const canBeDownloaded = local?.can_be_downloaded === true;
        // Redacts local.path, remote.id, and any internal provider tokens
        return Object.freeze({
            mode: 'metadata',
            file_id: fileIdStr,
            size,
            expected_size: expectedSize,
            is_downloaded: isDownloaded,
            downloaded_size: downloadedSize,
            can_be_downloaded: canBeDownloaded,
        });
    }
    async getFileContent(fileId, fileIdStr, options) {
        const maxBytes = options.maxBytes ?? options.max_bytes ?? 65536;
        if (!Number.isInteger(maxBytes) ||
            maxBytes < 1 ||
            maxBytes > MAX_FILE_CONTENT_BYTES) {
            throw new DomainError('INVALID_ARGUMENT', `max_bytes must be an integer between 1 and ${String(MAX_FILE_CONTENT_BYTES)}`);
        }
        const raw = await this.adapter.downloadFile({
            fileId,
            priority: 1,
            offset: 0,
            limit: maxBytes,
            synchronous: true,
        });
        const local = typeof raw.local === 'object' && raw.local !== null
            ? raw.local
            : null;
        const localPath = typeof local?.path === 'string' ? local.path : '';
        if (!localPath || localPath.trim().length === 0) {
            throw new DomainError('FILE_READ_FAILED', 'Downloaded file local path is unavailable or empty');
        }
        if (!this.fsExists(localPath)) {
            throw new DomainError('FILE_READ_FAILED', 'Downloaded file does not exist at local path');
        }
        const stat = this.fsLstat(localPath);
        if (!stat.isFile()) {
            throw new DomainError('FILE_READ_FAILED', 'Local file path is not a regular file');
        }
        if (stat.isSymbolicLink()) {
            throw new DomainError('FILE_READ_FAILED', 'Local file path cannot be a symbolic link');
        }
        const rawSize = typeof raw.size === 'number' && raw.size > 0 ? raw.size : null;
        const rawExpectedSize = typeof raw.expected_size === 'number' && raw.expected_size > 0
            ? raw.expected_size
            : null;
        const isCompleted = local?.is_downloading_completed === true;
        // Truthful file size semantics per pinned td_api.tl:
        // - file.size is exact total size (0 if unknown).
        // - file.expected_size is an approximate size in case exact size is unknown.
        // - If rawSize > 0, it is authoritative and exact.
        // - If rawSize is unknown but TDLib confirms download is completed, the local
        //   regular file stat.size is the exact total downloaded file size.
        // - If download is incomplete and rawSize is unknown:
        //   if rawExpectedSize > 0, it is conservative approximate fileSize (file_size_exact = false).
        //   otherwise, stat.size is the partial local size (file_size_exact = false).
        let fileSize;
        let fileSizeExact;
        if (rawSize !== null) {
            fileSize = rawSize;
            fileSizeExact = true;
        }
        else if (isCompleted) {
            fileSize = stat.size;
            fileSizeExact = true;
        }
        else if (rawExpectedSize !== null) {
            fileSize = rawExpectedSize;
            fileSizeExact = false;
        }
        else {
            fileSize = stat.size;
            fileSizeExact = false;
        }
        const bytesToRead = Math.min(stat.size, maxBytes);
        const buffer = Buffer.alloc(bytesToRead);
        const fd = this.fsOpen(localPath, 'r');
        let bytesRead;
        try {
            bytesRead = this.fsRead(fd, buffer, 0, bytesToRead, 0);
        }
        catch {
            throw new DomainError('FILE_READ_FAILED', 'Failed to read content from downloaded local file');
        }
        finally {
            try {
                this.fsClose(fd);
            }
            catch {
                // Safe fd cleanup
            }
        }
        const contentBuffer = buffer.subarray(0, bytesRead);
        const contentBase64 = contentBuffer.toString('base64');
        // Truncated is conservative:
        // - exact size > maxBytes => true
        // - local stat.size > maxBytes => true
        // - incomplete download where approximate expected size > maxBytes => true
        // - incomplete download hitting maxBytes limit (bytesRead >= maxBytes) => true
        const truncated = (rawSize !== null && rawSize > maxBytes) ||
            stat.size > maxBytes ||
            (!isCompleted &&
                rawExpectedSize !== null &&
                rawExpectedSize > maxBytes) ||
            (!isCompleted && bytesRead >= maxBytes);
        // Complete must never become true merely because approximate expected_size was reached.
        // It requires TDLib download completion (isCompleted === true), no truncation,
        // and full bytes read.
        const complete = isCompleted &&
            !truncated &&
            (rawSize !== null ? bytesRead >= rawSize : bytesRead >= stat.size);
        // Never return local filesystem path or remote credentials
        return Object.freeze({
            mode: 'content',
            file_id: fileIdStr,
            content_base64: contentBase64,
            byte_count: bytesRead,
            complete,
            truncated,
            file_size: fileSize,
            file_size_exact: fileSizeExact,
            expected_size: rawExpectedSize,
        });
    }
}
