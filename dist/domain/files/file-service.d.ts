import type { ITdlibAdapter } from '../../telegram/tdlib/adapter.js';
import { type FileGetOptions, type FileGetResult } from './types.js';
export interface FileServiceFsSeam {
    readonly existsSync?: (path: string) => boolean;
    readonly lstatSync?: (path: string) => {
        isFile: () => boolean;
        isSymbolicLink: () => boolean;
        size: number;
    };
    readonly openSync?: (path: string, flags: string) => number;
    readonly readSync?: (fd: number, buffer: Buffer, offset: number, length: number, position: number | null) => number;
    readonly closeSync?: (fd: number) => void;
}
export declare class FileService {
    private readonly adapter;
    private readonly fsExists;
    private readonly fsLstat;
    private readonly fsOpen;
    private readonly fsRead;
    private readonly fsClose;
    constructor(adapter: ITdlibAdapter, fsSeam?: FileServiceFsSeam);
    getFile(options: FileGetOptions): Promise<FileGetResult>;
    private getFileMetadata;
    private getFileContent;
}
