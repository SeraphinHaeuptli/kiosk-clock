/**
 * Talking to a Philips Hue bridge on the local network.
 *
 * Which API, and why it matters: this uses the v2 CLIP API over HTTPS, through
 * the small native client in `modules/hue-link`. The obvious alternative was
 * the old v1 API, which answers over plain HTTP and would need no native code
 * at all — but it would also mean permitting cleartext traffic in a build whose
 * only other network calls are deliberately https-only, and Signify has said
 * that HTTP access will be blocked once every bridge carries a signed
 * certificate. One of those is a bad trade and the other is a dead end.
 *
 * What the user has to do, which is not much: press the round button on the
 * bridge once. Everything else — finding it, agreeing a key, listing the
 * rooms — happens here. The Hue app itself is not involved; it is simply how
 * the bridge and the lights got set up in the first place.
 *
 * Nothing here throws. Every call reports a reason instead, the way the
 * weather source does, because all of it is failure the user has to be told
 * about plainly: a bridge that moved, a key the bridge forgot, a button nobody
 * pressed.
 */

import { hueRequest, isHueLinkAvailable } from '../../modules/hue-link';

import {
  decodeGroupState,
  groupName,
  isBridgeAddress,
  isBridgeId,
  isResourceId,
  toHueBrightness,
  type BridgeLink,
  type GroupKind,
  type LightGroup,
  type LightState,
} from './lights';

export type Attempt<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

/**
 * Signify's own discovery service: it answers with the bridges that share a
 * public address with whoever is asking. A proper HTTPS endpoint with a proper
 * certificate, so plain `fetch` reaches it — which is also what makes the
 * bridge id it returns worth something. The certificate on the bridge itself is
 * issued to that id, so a name obtained out here is what the pinned client
 * checks against the thing on the wifi.
 */
const DISCOVERY_URL = 'https://discovery.meethue.com';
const DISCOVERY_TIMEOUT_MS = 8_000;
const MAX_DISCOVERY_BYTES = 64 * 1024;

/**
 * How this app names itself to the bridge. It shows up in the Hue app's list
 * of connected apps, which is where someone goes to revoke it, so it says what
 * it is. The v1 pairing endpoint wants `application#device` and takes at most
 * forty characters.
 */
const DEVICE_TYPE = 'kiosk clock#phone';

/** What a bridge is asked for, and what it reports being. */
const CONFIG_PATH = '/api/0/config';
const PAIR_PATH = '/api';
const RESOURCE_PATH = '/clip/v2/resource';

export interface Discovered {
  id: string;
  ip: string;
}

function failed(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'AbortError' ? 'the request timed out' : error.message;
  }
  return 'unknown error';
}

/* -- Finding a bridge ------------------------------------------------------ */

export async function discoverBridges(): Promise<Attempt<Discovered[]>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);

  try {
    const response = await fetch(DISCOVERY_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return failed(`the lookup answered HTTP ${response.status}`);

    const text = await response.text();
    if (text.length > MAX_DISCOVERY_BYTES) return failed('the lookup said too much');

    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return failed('the lookup answered nonsense');

    const found: Discovered[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { id, internalipaddress } = entry as {
        id?: unknown;
        internalipaddress?: unknown;
      };
      if (typeof id !== 'string' || typeof internalipaddress !== 'string') continue;
      if (!isBridgeId(id) || !isBridgeAddress(internalipaddress)) continue;
      found.push({ id: id.toLowerCase(), ip: internalipaddress.trim() });
    }

    return { ok: true, value: found };
  } catch (error) {
    return failed(describe(error));
  } finally {
    clearTimeout(timeout);
  }
}

/* -- One request to the bridge --------------------------------------------- */

interface Call {
  ip: string;
  path: string;
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  appKey?: string;
  bridgeId?: string;
  pinned?: string;
}

interface Answer {
  status: number;
  json: unknown;
  /** The certificate that answered, for a caller that is about to pin it. */
  fingerprint: string;
}

async function call(options: Call): Promise<Attempt<Answer>> {
  if (!isHueLinkAvailable) {
    return failed('this build cannot reach a bridge');
  }
  if (!isBridgeAddress(options.ip)) {
    return failed(`${options.ip} is not an address on your network`);
  }

  try {
    const reply = await hueRequest({
      ip: options.ip.trim(),
      path: options.path,
      method: options.method,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      appKey: options.appKey,
      bridgeId: options.bridgeId,
      pinned: options.pinned,
    });

    let json: unknown = null;
    if (reply.body !== '') {
      try {
        json = JSON.parse(reply.body);
      } catch {
        // A bridge answers JSON to everything. Anything else is either not a
        // bridge or a captive portal, and both are worth saying out loud.
        return failed(`HTTP ${reply.status}, and not from a bridge`);
      }
    }

    return {
      ok: true,
      value: { status: reply.status, json, fingerprint: reply.fingerprint },
    };
  } catch (error) {
    return failed(describe(error));
  }
}

/**
 * The v2 API wraps everything in `{ data, errors }` and answers 200 with a
 * populated `errors` more often than it answers a 4xx, so both have to be
 * read. A refused key is worth naming exactly: it means the key was revoked in
 * the Hue app, and no amount of retrying will fix it.
 */
function unwrap(answer: Answer): Attempt<unknown[]> {
  if (answer.status === 401 || answer.status === 403) {
    return failed('the bridge refused the key — pair with it again');
  }

  const payload = answer.json;
  if (typeof payload !== 'object' || payload === null) {
    return failed(`HTTP ${answer.status} with no reply`);
  }

  const { data, errors } = payload as { data?: unknown; errors?: unknown };

  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0] as { description?: unknown };
    return failed(
      typeof first?.description === 'string' ? first.description : 'the bridge refused that',
    );
  }

  if (answer.status >= 400) return failed(`the bridge answered HTTP ${answer.status}`);
  if (!Array.isArray(data)) return failed('the bridge answered an unexpected shape');

  return { ok: true, value: data };
}

/* -- Pairing --------------------------------------------------------------- */

export interface BridgeFacts {
  id: string;
  /** What the bridge calls itself, which is usually "Philips hue". */
  name: string;
  fingerprint: string;
}

/**
 * Who is at this address, asked without a key.
 *
 * This is also where the certificate is first seen, so the fingerprint it
 * returns is the one pairing goes on to pin. When the id is already known from
 * discovery it is passed in, and the certificate has to name it — see the
 * native client for what that check is worth.
 */
export async function readBridge(
  ip: string,
  bridgeId?: string,
): Promise<Attempt<BridgeFacts>> {
  const answer = await call({ ip, path: CONFIG_PATH, bridgeId });
  if (!answer.ok) return answer;

  const payload = answer.value.json;
  if (typeof payload !== 'object' || payload === null) {
    return failed('nothing at that address answered like a bridge');
  }

  const { bridgeid, name } = payload as { bridgeid?: unknown; name?: unknown };
  if (typeof bridgeid !== 'string' || !isBridgeId(bridgeid)) {
    return failed('nothing at that address answered like a bridge');
  }

  const id = bridgeid.toLowerCase();
  // Discovery and the bridge disagreeing about who the bridge is would mean
  // the address is stale and now belongs to something else on the network.
  if (bridgeId && id !== bridgeId.toLowerCase()) {
    return failed('a different bridge answered at that address');
  }

  return {
    ok: true,
    value: {
      id,
      name: groupName(name, 'hue bridge'),
      fingerprint: answer.value.fingerprint,
    },
  };
}

/**
 * Ask the bridge for a key of our own, which only works in the thirty seconds
 * after its button is pressed.
 *
 * Pairing is the one request that still goes to the v1 endpoint: v2 has no
 * replacement for it, by design — the key it issues is the thing v2 then
 * authenticates with.
 */
export async function createKey(
  ip: string,
  bridgeId: string,
  pinned: string,
): Promise<Attempt<string>> {
  const answer = await call({
    ip,
    path: PAIR_PATH,
    method: 'POST',
    body: { devicetype: DEVICE_TYPE },
    bridgeId,
    pinned,
  });
  if (!answer.ok) return answer;

  const payload = answer.value.json;
  if (!Array.isArray(payload) || payload.length === 0) {
    return failed('the bridge answered an unexpected shape');
  }

  const entry = payload[0] as {
    success?: { username?: unknown };
    error?: { type?: unknown; description?: unknown };
  };

  const key = entry.success?.username;
  if (typeof key === 'string' && key !== '') return { ok: true, value: key };

  // 101 is the whole of the pairing handshake: it means the button has not
  // been pressed, which is not an error so much as an instruction.
  if (entry.error?.type === 101) {
    return failed('press the round button on the bridge, then try again');
  }

  return failed(
    typeof entry.error?.description === 'string'
      ? entry.error.description
      : 'the bridge would not issue a key',
  );
}

/* -- What there is to dim -------------------------------------------------- */

/** The id of a resource's `grouped_light` service, if it has one. */
function groupedLight(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { services } = raw as { services?: unknown };
  if (!Array.isArray(services)) return null;

  for (const service of services) {
    if (typeof service !== 'object' || service === null) continue;
    const { rid, rtype } = service as { rid?: unknown; rtype?: unknown };
    if (rtype === 'grouped_light' && typeof rid === 'string' && isResourceId(rid)) {
      return rid;
    }
  }
  return null;
}

function named(raw: unknown, fallback: string): string {
  if (typeof raw !== 'object' || raw === null) return fallback;
  const { metadata } = raw as { metadata?: unknown };
  if (typeof metadata !== 'object' || metadata === null) return fallback;
  return groupName((metadata as { name?: unknown }).name, fallback);
}

async function readCollection(
  link: Pick<BridgeLink, 'ip' | 'id' | 'key' | 'fingerprint'>,
  resource: 'room' | 'zone' | 'bridge_home',
): Promise<Attempt<unknown[]>> {
  const answer = await call({
    ip: link.ip,
    path: `${RESOURCE_PATH}/${resource}`,
    appKey: link.key,
    bridgeId: link.id,
    pinned: link.fingerprint,
  });
  if (!answer.ok) return answer;
  return unwrap(answer.value);
}

/**
 * Every group the slider could drive: rooms, then zones, then the whole house.
 *
 * Rooms and zones are both offered because the bridge treats them as different
 * things and people use both — a room is where a lamp is, a zone is a set of
 * lamps chosen by hand. Sorted by name so the list does not reorder itself
 * between visits, with everything-at-once pinned last: it is the one option
 * that is always there, and it is rarely the one wanted.
 *
 * A failure to read zones is not a failure overall. Older bridges answer 404
 * for resources they do not have, and losing the rooms over a missing zone
 * list would be a strange way to fail.
 */
export async function readGroups(
  link: Pick<BridgeLink, 'ip' | 'id' | 'key' | 'fingerprint'>,
): Promise<Attempt<LightGroup[]>> {
  const rooms = await readCollection(link, 'room');
  if (!rooms.ok) return rooms;

  const groups: LightGroup[] = [];

  const collect = (entries: unknown[], kind: GroupKind, fallback: string) => {
    for (const entry of entries) {
      const id = groupedLight(entry);
      if (id === null) continue;
      groups.push({ id, name: named(entry, fallback), kind });
    }
  };

  collect(rooms.value, 'room', 'room');

  const zones = await readCollection(link, 'zone');
  if (zones.ok) collect(zones.value, 'zone', 'zone');

  groups.sort((a, b) => a.name.localeCompare(b.name));

  const everything = await readCollection(link, 'bridge_home');
  if (everything.ok) {
    for (const entry of everything.value) {
      const id = groupedLight(entry);
      if (id !== null) groups.push({ id, name: 'all lights', kind: 'all' });
    }
  }

  if (groups.length === 0) {
    return failed('the bridge has no rooms with lights in them');
  }
  return { ok: true, value: groups };
}

/* -- The brightness itself ------------------------------------------------- */

export async function readBrightness(link: BridgeLink): Promise<Attempt<LightState>> {
  const answer = await call({
    ip: link.ip,
    path: `${RESOURCE_PATH}/grouped_light/${link.groupId}`,
    appKey: link.key,
    bridgeId: link.id,
    pinned: link.fingerprint,
  });
  if (!answer.ok) return answer;

  const data = unwrap(answer.value);
  if (!data.ok) return data;

  const state = decodeGroupState(data.value[0]);
  if (state === null) return failed('that group is gone — pick another');

  return { ok: true, value: state };
}

/**
 * Set the group's brightness.
 *
 * The bottom of the slider switches the lights off rather than setting one
 * percent, because that is what a dimmer does and because Hue will not accept
 * a brightness of zero anyway. Anything above it switches them back on in the
 * same request: a brightness written to a group that is off is remembered and
 * not shown, which looks exactly like a slider that does nothing.
 */
export async function writeBrightness(
  link: BridgeLink,
  level: number,
): Promise<Attempt<void>> {
  const off = level <= 0;
  const answer = await call({
    ip: link.ip,
    path: `${RESOURCE_PATH}/grouped_light/${link.groupId}`,
    method: 'PUT',
    body: off
      ? { on: { on: false } }
      : { on: { on: true }, dimming: { brightness: toHueBrightness(level) } },
    appKey: link.key,
    bridgeId: link.id,
    pinned: link.fingerprint,
  });
  if (!answer.ok) return answer;

  const data = unwrap(answer.value);
  if (!data.ok) return data;

  return { ok: true, value: undefined };
}
