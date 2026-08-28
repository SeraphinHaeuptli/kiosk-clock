/**
 * What is playing, and where that claim came from.
 *
 * Same provenance rule as everything else here: a configured source that fails
 * must never be mistaken for one that is working. 'none' means nothing is
 * configured, 'stale' means something is and it broke.
 */

const REQUEST_TIMEOUT_MS = 6_000;

export interface Track {
  title: string;
  artist: string | null;
  playing: boolean;
}

export type NowPlayingMode = 'none' | 'live' | 'stale';

export interface NowPlayingResult {
  track: Track | null;
  mode: NowPlayingMode;
  /** Why a live fetch failed. Present only when mode is 'stale'. */
  warning?: string;
}

type Json = Record<string, unknown>;

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Accepts the obvious field names rather than insisting on one shape — the
 * likely producers here are a `playerctl` wrapper or an MPRIS bridge, and they
 * disagree about capitalisation.
 */
function decodeTrack(raw: unknown): Track | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Json;

  const title =
    text(input.title) ?? text(input.track) ?? text(input.name) ?? null;
  if (!title) return null;

  const playing =
    typeof input.playing === 'boolean'
      ? input.playing
      : typeof input.isPlaying === 'boolean'
        ? input.isPlaying
        : input.status !== 'paused' && input.status !== 'stopped';

  return {
    title,
    artist: text(input.artist) ?? text(input.author) ?? null,
    playing,
  };
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'AbortError' ? 'request timed out' : error.message;
  }
  return 'unknown error';
}

export async function loadNowPlaying(
  endpoint: string,
): Promise<NowPlayingResult> {
  if (!endpoint) return { track: null, mode: 'none' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    // A source with nothing playing is a valid answer, not a failure.
    return { track: decodeTrack(await response.json()), mode: 'live' };
  } catch (error) {
    return { track: null, mode: 'stale', warning: describe(error) };
  } finally {
    clearTimeout(timeout);
  }
}

/** One line for the display: "Title — Artist", or just the title. */
export function trackLine(track: Track | null): string {
  if (!track) return 'nothing playing';
  return track.artist ? `${track.title} — ${track.artist}` : track.title;
}
