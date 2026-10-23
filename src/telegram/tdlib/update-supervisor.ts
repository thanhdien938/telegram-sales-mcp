import {
  isTdlibAuthorizationState,
  type TdlibAuthorizationState,
} from './types.js';

export interface UpdateSupervisorMetrics {
  readonly isRunning: boolean;
  readonly currentAuthorizationState: TdlibAuthorizationState | null;
  readonly updateCount: number;
  readonly unknownUpdateCount: number;
  readonly lastUpdateAt: number | null;
}

export class UpdateSupervisor {
  private isRunning = false;
  private currentAuthorizationState: TdlibAuthorizationState | null = null;
  private updateCount = 0;
  private unknownUpdateCount = 0;
  private lastUpdateAt: number | null = null;
  private readonly listeners = new Set<
    (state: TdlibAuthorizationState) => void
  >();

  start(): void {
    this.isRunning = true;
  }

  stop(): void {
    this.isRunning = false;
    this.listeners.clear();
  }

  handleUpdate(payload: Readonly<Record<string, unknown>>): void {
    if (!this.isRunning) {
      return;
    }

    this.updateCount++;
    this.lastUpdateAt = Date.now();

    const type = payload['@type'];
    if (type === 'updateAuthorizationState') {
      const authStateObj = payload.authorization_state;
      if (typeof authStateObj === 'object' && authStateObj !== null) {
        const authType = (authStateObj as Record<string, unknown>)['@type'];
        if (isTdlibAuthorizationState(authType)) {
          const previous = this.currentAuthorizationState;
          this.currentAuthorizationState = authType;
          if (previous !== authType) {
            for (const listener of this.listeners) {
              try {
                listener(authType);
              } catch {
                // Safeguard against unhandled listener exceptions
              }
            }
          }
          return;
        }
      }
      this.unknownUpdateCount++;
      return;
    }

    // Other TDLib updates are safely ignored and counted for diagnostics
    this.unknownUpdateCount++;
  }

  getCurrentAuthorizationState(): TdlibAuthorizationState | null {
    return this.currentAuthorizationState;
  }

  subscribeAuthorizationState(
    listener: (state: TdlibAuthorizationState) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getMetrics(): UpdateSupervisorMetrics {
    return Object.freeze({
      isRunning: this.isRunning,
      currentAuthorizationState: this.currentAuthorizationState,
      updateCount: this.updateCount,
      unknownUpdateCount: this.unknownUpdateCount,
      lastUpdateAt: this.lastUpdateAt,
    });
  }
}
