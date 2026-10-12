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

/**
 * One Bluetooth lamp, as the phone knows it.
 *
 * The address is the lamp's Bluetooth address, which is stable until someone
 * factory-resets the lamp — Hue generates a new random one when they do, and
 * the lamp then has to be found again.
 */
export interface Lamp {
  address: string;
  name: string;
}

/**
 * Where the light comes from.
 *
 * Two completely different things wearing the same slider. A bridge is one
 * HTTPS endpoint driving a whole room; Bluetooth lamps are a connection each,
 * held open by the phone, with no bridge in the house. Which one someone has
 * is a fact about their shelf, not a preference, so this is stored rather than
 * chosen in settings.
 */
export type LightsSource =
  | { kind: 'bridge'; bridge: BridgeLink }
  | { kind: 'lamps'; lamps: Lamp[] };

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

/** `AA:BB:CC:DD:EE:FF`, as Android spells a Bluetooth address. */
export function isLampAddress(value: string): boolean {
  return /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(value.trim());
}

export function decodeLamps(raw: unknown): Lamp[] {
  if (!Array.isArray(raw)) return [];

  const lamps: Lamp[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { address, name } = entry as { address?: unknown; name?: unknown };
    if (typeof address !== 'string' || !isLampAddress(address)) continue;
    lamps.push({
      address: address.trim().toUpperCase(),
      name: groupName(name, 'lamp'),
    });
  }
  return lamps;
}

/**
 * A source out of storage, or null.
 *
 * Also reads the shape written before Bluetooth lamps existed, which was a
 * bare bridge link: settings outlive the build that wrote them, and a bridge
 * someone paired yesterday should not quietly become "no lights".
 */
export function decodeSource(raw: unknown): LightsSource | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as { kind?: unknown; lamps?: unknown; bridge?: unknown };

  if (value.kind === 'lamps' || Array.isArray(value.lamps)) {
    const lamps = decodeLamps(value.lamps);
    return lamps.length === 0 ? null : { kind: 'lamps', lamps };
  }

  const bridge = decodeLink(value.kind === 'bridge' ? value.bridge : raw);
  return bridge === null ? null : { kind: 'bridge', bridge };
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

/* -- A lamp's own numbers -------------------------------------------------- */

/** Hue's Bluetooth scale: 1 is the dimmest a lamp goes, 254 the brightest. */
const LAMP_MIN = 1;
const LAMP_MAX = 254;

export function toLampBrightness(level: number): number {
  return Math.round(clamp01(level) * (LAMP_MAX - LAMP_MIN)) + LAMP_MIN;
}

/**
 * The slider's level for a lamp.
 *
 * A lamp that is off reads as zero rather than as the brightness it will come
 * back at, for the same reason a dark room does on the bridge: a slider at 60%
 * above lights that are out is simply wrong.
 */
export function fromLampBrightness(
  brightness: number | null,
  on: boolean,
): number {
  if (!on) return 0;
  if (brightness === null) return 1;
  return clamp01((brightness - LAMP_MIN) / (LAMP_MAX - LAMP_MIN));
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
      return 'connecting...';
    case 'failed':
      return status.reason;
    case 'absent':
      return 'lights are not in this build';
    case 'unpaired':
      return 'no lights set up';
    case 'off':
    case 'live':
      return null;
  }
}

/**
 * What a hook driving one kind of light has to provide.
 *
 * Two of them exist — a bridge over HTTPS, lamps over Bluetooth — and the bar
 * cannot tell which it is looking at. Keeping them behind one shape is what
 * lets the slider, the status line and the failure text be written once.
 */
export interface Transport {
  /** 0 to 1. */
  level: number;
  /** False until something has actually reported a level. */
  known: boolean;
  status: LightsStatus;
  set: (level: number) => void;
  setDragging: (dragging: boolean) => void;
}

/** "living room", or "3 lamps" when there is no one name to use. */
export function lampsName(lamps: readonly Lamp[]): string {
  if (lamps.length === 0) return 'lights';
  if (lamps.length === 1) return lamps[0]?.name ?? 'lamp';
  return `${lamps.length} lamps`;
}

/** The same thing as a settings line, which has room to name the group. */
export function lightsStatusLine(status: LightsStatus, name: string): string {
  switch (status.kind) {
    case 'off':
      return 'off';
    case 'absent':
      return 'unavailable in this build';
    case 'unpaired':
      return 'nothing set up yet';
    case 'reading':
      return 'connecting...';
    case 'live':
      return `live for ${name}`;
    case 'failed':
      return `unavailable - ${status.reason}`;
  }
}
