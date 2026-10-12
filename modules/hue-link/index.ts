import { requireOptionalNativeModule } from 'expo';

interface HueLinkNative {
  request(
    ip: string,
    path: string,
    method: 'GET' | 'POST' | 'PUT',
    body: string | null,
    appKey: string | null,
    bridgeId: string | null,
    pinned: string | null,
  ): Promise<{ status: number; body: string; fingerprint: string }>;
}

/**
 * Optional by design: Android-only, and absent from Expo Go and the web, where
 * there is no way to reach a Hue bridge at all. Callers check
 * `isHueLinkAvailable` and say so rather than failing a request that was never
 * going to work.
 */
const native = requireOptionalNativeModule<HueLinkNative>('HueLink');

export const isHueLinkAvailable = native !== null;

export interface HueReply {
  /** HTTP status. A bridge says plenty with a 4xx body, so read both. */
  status: number;
  body: string;
  /** sha-256 of the certificate that answered, as lowercase hex. */
  fingerprint: string;
}

export interface HueCall {
  /** IPv4 of the bridge on the local network. */
  ip: string;
  /** Absolute path, starting with a slash. */
  path: string;
  method?: 'GET' | 'POST' | 'PUT';
  /** JSON to send, or undefined for a request without one. */
  body?: string;
  /** The application key, sent as `hue-application-key`. */
  appKey?: string;
  /**
   * The bridge id the certificate must name. Only consulted before there is a
   * fingerprint to pin — after that the pin is the stronger check of the two.
   */
  bridgeId?: string;
  /** The fingerprint recorded at pairing. Nothing else will be talked to. */
  pinned?: string;
}

/**
 * Throws when the bridge cannot be reached, or when it is not the one that was
 * paired with. Callers turn that into a reason to show, the way the weather
 * source does.
 */
export async function hueRequest(call: HueCall): Promise<HueReply> {
  if (!native) throw new Error('this build cannot reach a hue bridge');

  return native.request(
    call.ip,
    call.path,
    call.method ?? 'GET',
    call.body ?? null,
    call.appKey ?? null,
    call.bridgeId ?? null,
    call.pinned ?? null,
  );
}
