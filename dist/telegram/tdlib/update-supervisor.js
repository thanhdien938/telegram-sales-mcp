import { isTdlibAuthorizationState, } from './types.js';
export class UpdateSupervisor {
    isRunning = false;
    currentAuthorizationState = null;
    updateCount = 0;
    unknownUpdateCount = 0;
    lastUpdateAt = null;
    listeners = new Set();
    start() {
        this.isRunning = true;
    }
    stop() {
        this.isRunning = false;
        this.listeners.clear();
    }
    handleUpdate(payload) {
        if (!this.isRunning) {
            return;
        }
        this.updateCount++;
        this.lastUpdateAt = Date.now();
        const type = payload['@type'];
        if (type === 'updateAuthorizationState') {
            const authStateObj = payload.authorization_state;
            if (typeof authStateObj === 'object' && authStateObj !== null) {
                const authType = authStateObj['@type'];
                if (isTdlibAuthorizationState(authType)) {
                    const previous = this.currentAuthorizationState;
                    this.currentAuthorizationState = authType;
                    if (previous !== authType) {
                        for (const listener of this.listeners) {
                            try {
                                listener(authType);
                            }
                            catch {
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
    getCurrentAuthorizationState() {
        return this.currentAuthorizationState;
    }
    subscribeAuthorizationState(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    getMetrics() {
        return Object.freeze({
            isRunning: this.isRunning,
            currentAuthorizationState: this.currentAuthorizationState,
            updateCount: this.updateCount,
            unknownUpdateCount: this.unknownUpdateCount,
            lastUpdateAt: this.lastUpdateAt,
        });
    }
}
