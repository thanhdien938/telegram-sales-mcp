import type { WirePort } from './native-channel.js';
import type { NativeMode } from './native-policy.js';
/** Only fixed generic wrapper and verified explicit bundle files; secrets never in argv/env. */
export declare function spawnNativeWire(python: string, wrapper: string, dll: string, mode: NativeMode): WirePort;
