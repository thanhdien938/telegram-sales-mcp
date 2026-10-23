import { TdlibError } from '../../telegram/tdlib/errors.js';
import type { ITdlibAdapter } from '../../telegram/tdlib/adapter.js';
import type { SafeAccountIdentity } from '../../telegram/tdlib/types.js';
import {
  mapAuthStateToReauth,
  mapAuthStateToRuntimeStatus,
  type AccountRuntimeHealth,
  type AccountSnapshot,
  type ReauthStateReport,
} from './types.js';

export class AccountService {
  private readonly adapter: ITdlibAdapter;
  private isStarted = false;
  private isClosed = false;
  private cachedIdentity: SafeAccountIdentity | null = null;

  constructor(adapter: ITdlibAdapter) {
    this.adapter = adapter;
  }

  async start(): Promise<void> {
    if (this.isClosed) {
      throw new TdlibError(
        'LIFECYCLE_ERROR',
        'Cannot start AccountService: service is closed',
      );
    }
    if (this.isStarted) {
      throw new TdlibError(
        'LIFECYCLE_ERROR',
        'Cannot start AccountService: service is already started',
      );
    }

    this.isStarted = true;
    try {
      await this.adapter.start();
    } catch (error) {
      this.isStarted = false;
      this.isClosed = true;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;
    try {
      await this.adapter.stop();
    } finally {
      this.cachedIdentity = null;
    }
  }

  async getAccountSnapshot(): Promise<AccountSnapshot> {
    this.assertOperational();

    const health = this.adapter.getRuntimeHealth();
    const authState =
      health.authorization_state !== 'unknown'
        ? health.authorization_state
        : await this.adapter.getAuthorizationState();

    if (authState === 'authorizationStateReady') {
      try {
        const identity = await this.adapter.getOwnAccountIdentity();
        this.cachedIdentity = identity;
        return Object.freeze({
          authorization_state: authState,
          runtime_status: 'ready',
          own_identity_read: identity.own_identity_read,
          user_object_type: identity.user_object_type,
          user_id_present: identity.user_id_present,
          is_bot: identity.is_bot,
        });
      } catch {
        this.cachedIdentity = null;
        return Object.freeze({
          authorization_state: authState,
          runtime_status: 'ready',
          own_identity_read: false,
          user_object_type: 'unknown',
          user_id_present: false,
          is_bot: null,
        });
      }
    }

    const runtimeStatus = mapAuthStateToRuntimeStatus(authState);
    this.cachedIdentity = null;
    return Object.freeze({
      authorization_state: authState,
      runtime_status: runtimeStatus,
      own_identity_read: false,
      user_object_type: 'unknown',
      user_id_present: false,
      is_bot: null,
    });
  }

  getReauthState(): ReauthStateReport {
    if (!this.isStarted && !this.isClosed) {
      return Object.freeze({
        reauth_required: false,
        authorization_state: 'unknown',
        reason: 'NOT_STARTED',
      });
    }

    if (this.isClosed) {
      return Object.freeze({
        reauth_required: false,
        authorization_state: 'authorizationStateClosed',
        reason: 'SESSION_CLOSED',
      });
    }

    const health = this.adapter.getRuntimeHealth();
    return mapAuthStateToReauth(health.authorization_state);
  }

  getRuntimeHealth(): AccountRuntimeHealth {
    if (!this.isStarted && !this.isClosed) {
      return Object.freeze({
        runtime_status: 'stopped',
        transport_status: 'stopped',
        authorization_state: 'unknown',
        authenticated: false,
        reauth_required: false,
        own_identity_available: false,
        update_supervisor_running: false,
        pending_request_count: 0,
        update_count: 0,
        last_error_type: null,
      });
    }

    if (this.isClosed) {
      const adapterHealth = this.adapter.getRuntimeHealth();
      return Object.freeze({
        runtime_status: 'closed',
        transport_status: adapterHealth.transport_status,
        authorization_state: adapterHealth.authorization_state,
        authenticated: false,
        reauth_required: false,
        own_identity_available: false,
        update_supervisor_running: false,
        pending_request_count: 0,
        update_count: adapterHealth.update_count,
        last_error_type: adapterHealth.last_error_type,
      });
    }

    const adapterHealth = this.adapter.getRuntimeHealth();
    const authState = adapterHealth.authorization_state;
    const reauth = mapAuthStateToReauth(authState);
    const authenticated =
      authState === 'authorizationStateReady' &&
      adapterHealth.transport_status === 'running';
    let runtimeStatus = mapAuthStateToRuntimeStatus(
      authState,
      adapterHealth.transport_status,
    );
    if (
      adapterHealth.last_error_type === 'TRANSPORT_ERROR' &&
      adapterHealth.transport_status === 'running'
    ) {
      runtimeStatus = 'degraded';
    }
    if (!authenticated) this.cachedIdentity = null;

    return Object.freeze({
      runtime_status: runtimeStatus,
      transport_status: adapterHealth.transport_status,
      authorization_state: authState,
      authenticated,
      reauth_required: reauth.reauth_required,
      own_identity_available:
        authenticated &&
        runtimeStatus === 'ready' &&
        (this.cachedIdentity?.own_identity_read ?? false),
      update_supervisor_running: adapterHealth.update_supervisor_running,
      pending_request_count: adapterHealth.pending_request_count,
      update_count: adapterHealth.update_count,
      last_error_type: adapterHealth.last_error_type,
    });
  }

  private assertOperational(): void {
    if (this.isClosed) {
      throw new TdlibError('TRANSPORT_STOPPED', 'AccountService is stopped');
    }
    if (!this.isStarted) {
      throw new TdlibError(
        'TRANSPORT_NOT_STARTED',
        'AccountService is not started',
      );
    }
  }
}
