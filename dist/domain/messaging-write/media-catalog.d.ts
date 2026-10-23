import { ApprovedMediaRegistry } from './approved-media-registry.js';
/**
 * Loads and validates the opt-in local media catalog from env. Returns
 * undefined when unset (the default: no media registry entries at all, so
 * SEND_MEDIA/SCHEDULE_MEDIA deny with INVALID_ARGUMENT "Unknown media
 * reference" rather than silently succeeding). Never logs the manifest path
 * or file contents.
 */
export declare function loadMediaCatalogFromEnv(env?: Record<string, string | undefined>): ApprovedMediaRegistry | undefined;
