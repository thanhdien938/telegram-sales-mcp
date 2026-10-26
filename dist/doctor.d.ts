export interface DoctorCheck {
    readonly name: string;
    readonly status: 'PASS' | 'WARN' | 'FAIL';
    readonly message: string;
    readonly repairStep?: string;
}
export interface DoctorReport {
    readonly checks: readonly DoctorCheck[];
    readonly toolsAvailable: number;
    readonly summary: string;
}
export declare function runDoctor(options?: {
    state?: string | undefined;
    manifest?: string | undefined;
    python?: string | undefined;
    crm?: string | undefined;
    chatId?: string | undefined;
    writesEnabled?: boolean | undefined;
}): DoctorReport;
