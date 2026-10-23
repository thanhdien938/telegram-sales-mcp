export const MAX_FILE_CONTENT_BYTES = 262_144; // 256 KB hard limit

export type FileGetMode = 'metadata' | 'content';

export interface FileGetMetadataOptions {
  readonly mode: 'metadata';
  readonly fileId?: string | undefined;
  readonly file_id?: string | undefined;
}

export interface FileGetContentOptions {
  readonly mode: 'content';
  readonly fileId?: string | undefined;
  readonly file_id?: string | undefined;
  readonly maxBytes?: number | undefined;
  readonly max_bytes?: number | undefined;
}

export type FileGetOptions = FileGetMetadataOptions | FileGetContentOptions;

export interface NormalizedFileMetadata {
  readonly mode: 'metadata';
  readonly file_id: string;
  readonly size: number;
  readonly expected_size: number;
  readonly is_downloaded: boolean;
  readonly downloaded_size: number;
  readonly can_be_downloaded: boolean;
}

export interface NormalizedFileContent {
  readonly mode: 'content';
  readonly file_id: string;
  readonly content_base64: string;
  readonly byte_count: number;
  readonly complete: boolean;
  readonly truncated: boolean;
  readonly file_size: number;
  /**
   * Indicates whether file_size represents an exact known byte count.
   * True if raw.size > 0 or if the file download has completed to disk.
   * False if file_size is based on an approximate expected_size or partial incomplete download.
   */
  readonly file_size_exact: boolean;
  /**
   * Approximate expected file size reported by TDLib, or null if not provided.
   */
  readonly expected_size: number | null;
}

export type FileGetResult = NormalizedFileMetadata | NormalizedFileContent;
