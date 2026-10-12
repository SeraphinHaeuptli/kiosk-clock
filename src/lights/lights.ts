/**
 * What the app remembers about a Philips Hue bridge, and the shapes its API
 * answers in.
 *
 * Everything here is pure. The requests live in `bridge.ts`, and the one piece
 * of state — the paired bridge — lives in `store.ts`.
 */

import { clamp01 } from '@/core/format';

/** Room for "living room" or "kitchen", not for an essay. */
const NAME_LIMIT = 24;

/**
 * A paired bridge, and the light group the slider drives.
 *
 * `key` is an application key the bridge issued to this phone when someone
 * pressed the button on it. It is worth exactly what the bridge is: it dims
 * and switches lights on one local network, it carries no account and no
 * payment, and the bridge can be made to forget it. It is still a credential,
 * so it stays on the device — nothing in this app sends it anywhere except to
 * the bridge that issued it.
 */
export interface BridgeLink {
  /** IPv4 on the local network, as discovery reported it or someone typed it. */
  ip: string;
  /** The bridge's own id. Also what its certificate is issued to. */
  id: string;
  key: string;
  /** sha-256 of the certificate the bridge presented when it was paired. */
  fingerprint: string;
  /** The `grouped_light` resource a brightness write goes to. */
  groupId: string;
  /** What to call it on screen. Resolved at pairing, not on every render. */
  groupName: string;
}

/** A room, a zone, or every light the bridge knows about. */
export type GroupKind = 'room' | 'zone' | 'all';

export interface LightGroup {
  /** The id of the group's `grouped_light` service, not of the room itself. */
  id: string;
  name: string;
  kind: GroupKind;
}

/** What a group is doing right now. */
export interface LightState {
  on: boolean;
  /** 0 to 1. Hue's own scale is a percentage; this matches the volume bar. */
  level: number;
}

/**
 * An address this app is willing to connect to.
 *
 * IPv4 only, and only in syntax — not restricted to the private ranges,
 * because a bridge reached over a VPN or through a mesh network has a perfectly
 * ordinary-looking address that is not in any of them.
 */
const IPV4 =
  /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

export function isBridgeAddress(value: string): boolean {
  return IPV4.test(value.trim());
}

/** Sixteen hex characters, as both discovery and the certificate spell it. */
export function isBridgeId(value: string): boolean {
  return /^[0-9a-f]{16}$/i.test(value.trim());
}

/** A resource id out of the v2 API: a uuid. */
export function isResourceId(value: string): boolean {
  return /^[0-9a-f-]{8,64}$/i.test(value.trim());
}

export function groupName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  return trimmed === '' ? fallback : trimmed.slice(0, NAME_LIMIT);
}

/**
 * A link out of storage, or null.
 *
 * Stricter than the settings decoder, which falls back field by field: half a
 * bridge link is not a usable one, and a stored shape that does not validate
 * means the lights are simply unpaired rather than pointed at a guess.
 */
export function decodeLink(raw: unknown): BridgeLink | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Partial<Record<keyof BridgeLink, unknown>>;

  const strings = ['ip', 'id', 'key', 'fingerprint', 'groupId'] as const;
  for (const field of strings) {
    if (typeof value[field] !== 'string' || value[field] === '') return null;
  }

  const ip = value.ip as string;
  const id = value.id as string;
  const groupId = value.groupId as string;

  if (!isBridgeAddress(ip) || !isBridgeId(id) || !isResourceId(groupId)) {
    return null;
  }

  return {
    ip: ip.trim(),
    id: id.trim().toLowerCase(),
    key: (value.key as string).trim(),
    fingerprint: (value.fingerprint as string).trim().toLowerCase(),
    groupId: groupId.trim(),
    groupName: groupName(value.groupName, 'lights'),
  };
}

/* -- The bridge's own numbers ---------------------------------------------- */

/**
 * Hue states brightness as a percentage, and a zero is not an off: writing one
 * sets the lowest brightness the lamp has. So the floor here is one percent,
 * and switching off is a separate instruction — see `writeBrightness`.
 */
export function toHueBrightness(level: number): number {
  return Math.min(100, Math.max(1, Math.round(clamp01(level) * 100)));
}

/**
 * How a group reads as one number.
 *
 * Lights that are off read as zero rather than as whatever brightness they
 * were last left at, because a slider sitting at 60% above a dark room is a
 * readout that is simply wrong. Dragging up from the bottom turns them back
 * on, which is what a dimmer does.
 */
export function fromGroupState(state: LightState): number {
  return state.on ? clamp01(state.level) : 0;
}

/**
 * The state of one `grouped_light`, out of a v2 reply.
 *
 * A group with no `dimming` at all is a group of switches rather than dimmers,
 * and reports full brightness when on: that is what it is, and claiming null
 * would hide a group someone deliberately chose.
 */
export function decodeGroupState(raw: unknown): LightState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as { on?: unknown; dimming?: unknown };

  const on =
    typeof value.on === 'object' && value.on !== null
      ? (value.on as { on?: unknown }).on
      : undefined;
  if (typeof on !== 'boolean') return null;

  const dimming =
    typeof value.dimming === 'object' && value.dimming !== null
      ? (value.dimming as { brightness?: unknown }).brightness
      : undefined;

  const level =
    typeof dimming === 'number' && Number.isFinite(dimming)
      ? clamp01(dimming / 100)
      : 1;

  return { on, level };
}

/* -- How it reads on screen ------------------------------------------------ */

export type LightsStatus =
  /** The setting is off. Nothing is requested. */
  | { kind: 'off' }
  /** No native client: the web build, or Expo Go. */
  | { kind: 'absent' }
  | { kind: 'unpaired' }
  | { kind: 'reading' }
  | { kind: 'live' }
  | { kind: 'failed'; reason: string };

/**
 * What to say on the lights bar instead of the room name, or null when the
 * room name is the right thing to say.
 *
 * A failure belongs on the bar rather than only in settings: a slider that
 * quietly stops working is the thing people file bugs about, and "the bridge
 * refused the key" is an instruction once you can see it.
 */
export function lightsProblem(status: LightsStatus): string | null {
  switch (status.kind) {
    case 'reading':
      return 'reaching the bridge...';
    case 'failed':
      return status.reason;
    case 'absent':
      return 'no bridge support in this build';
    case 'unpaired':
      return 'no bridge paired';
    case 'off':
    case 'live':
      return null;
  }
}

/** The same thing as a settings line, which has room to name the group. */
export function lightsStatusLine(status: LightsStatus, name: string): string {
  switch (status.kind) {
    case 'off':
      return 'off';
    case 'absent':
      return 'unavailable in this build';
    case 'unpaired':
      return 'no bridge paired';
    case 'reading':
      return 'reaching the bridge...';
    case 'live':
      return `live for ${name}`;
    case 'failed':
      return `unavailable - ${status.reason}`;
  }
}
