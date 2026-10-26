export interface DoctorCheck {
    readonly name: string;
    readonly status: 'PASS' | 'WARN' | 'FAIL';
    readonly message: string;
    readonly repairStep?: string | undefined;
}
export interface DoctorReport {
    readonly checks: readonly DoctorCheck[];
    readonly toolsReady: number;
    readonly toolsRegistered: number;
    readonly toolsAvailable: number;
    readonly isHealthy: boolean;
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
