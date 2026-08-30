/**
 * Weather domain: the shape the app reads, and the pure decoders that turn
 * two third-party payloads into it.
 *
 * Everything here is a total function over `unknown`. The forecast and the
 * geocoder are other people's services and can change, go down, or answer
 * with something unexpected; a clock is not allowed to crash because the
 * weather moved. Anything unrecognised decodes to null and the corner stays
 * empty, which is the correct thing for a display you glance at.
 */

export type Condition =
  | 'clear'
  | 'fair'
  | 'cloudy'
  | 'overcast'
  | 'fog'
  | 'rain'
  | 'sleet'
  | 'snow'
  | 'storm'
  | 'unknown';

export interface DayRange {
  condition: Condition;
  high: number | null;
  low: number | null;
}

export interface Weather {
  /** Always celsius, as the source gives it. Converted at the last moment. */
  temperature: number;
  condition: Condition;
  /** The rest of today, where the forecast reaches that far. */
  high: number | null;
  low: number | null;
  /** Metres per second, as the source gives it. Converted for display. */
  wind: number | null;
  /** Millimetres expected over the next six hours. */
  rain: number | null;
  /** Null until the forecast reaches tomorrow, which it does by mid-morning. */
  tomorrow: DayRange | null;
}

export interface Place {
  latitude: number;
  longitude: number;
  /** What to show: the place as the user would name it, not the full address. */
  label: string;
}

export type TemperatureUnit = 'celsius' | 'fahrenheit';

/* -- Conditions ------------------------------------------------------------ */

/** One word each, lowercase, in the same register as the rest of the UI. */
const CONDITION_WORDS: Record<Condition, string> = {
  clear: 'clear',
  fair: 'fair',
  cloudy: 'cloudy',
  overcast: 'overcast',
  fog: 'fog',
  rain: 'rain',
  sleet: 'sleet',
  snow: 'snow',
  storm: 'storm',
  unknown: '',
};

export function conditionWord(condition: Condition): string {
  return CONDITION_WORDS[condition];
}

/**
 * Collapses a symbol code onto one of ten words.
 *
 * The source publishes around a hundred codes — every combination of
 * intensity, shower, thunder and time of day — and a corner readout has room
 * for one word. Order matters: 'partlycloudy' contains 'cloudy', and a code
 * for rain with thunder should read as a storm rather than as rain, so the
 * more specific test has to come first in both cases.
 */
export function conditionFor(symbol: string): Condition {
  const base = symbol.toLowerCase().replace(/_(day|night|polartwilight)$/, '');

  if (base.includes('thunder')) return 'storm';
  if (base.includes('snow')) return 'snow';
  if (base.includes('sleet')) return 'sleet';
  if (base.includes('rain') || base.includes('drizzle')) return 'rain';
  if (base.includes('fog')) return 'fog';
  if (base.includes('partlycloudy')) return 'cloudy';
  if (base.includes('cloudy')) return 'overcast';
  if (base.includes('fair')) return 'fair';
  if (base.includes('clearsky')) return 'clear';

  return 'unknown';
}

/* -- Decoding -------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // The geocoder returns coordinates as strings.
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function symbolOf(data: Record<string, unknown>): string {
  // Whichever window the entry carries. The last hours of a forecast only have
  // the wider ones, and near the end only the twelve-hour summary survives.
  for (const key of ['next_1_hours', 'next_6_hours', 'next_12_hours']) {
    const summary = asRecord(asRecord(data[key])?.summary);
    const code = summary?.symbol_code;
    if (typeof code === 'string') return code;
  }
  return '';
}

/**
 * Reads a MET Norway `locationforecast/2.0/compact` document.
 *
 * `now` is passed in rather than read, so the same fixture decodes the same
 * way in a test as it does at runtime.
 */
/** Same calendar day in the device's own zone — the clock standing next to it. */
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

/**
 * Highest, lowest and prevailing condition across one local day.
 *
 * The condition is taken from the entry nearest midday rather than the first
 * of the day: a summary of tomorrow that reports the weather at one in the
 * morning describes a night nobody is asking about.
 */
function rangeOver(series: readonly unknown[], day: Date): DayRange | null {
  let high: number | null = null;
  let low: number | null = null;
  let noonSymbol = '';
  let noonGap = Infinity;

  for (const entry of series) {
    const record = asRecord(entry);
    const time = typeof record?.time === 'string' ? new Date(record.time) : null;
    if (!time || Number.isNaN(time.getTime()) || !sameDay(time, day)) continue;

    const data = asRecord(record?.data);
    const value = asNumber(
      asRecord(asRecord(data?.instant)?.details)?.air_temperature,
    );
    if (value !== null) {
      high = high === null ? value : Math.max(high, value);
      low = low === null ? value : Math.min(low, value);
    }

    const gap = Math.abs(time.getHours() - 12);
    if (data && gap < noonGap) {
      const symbol = symbolOf(data);
      if (symbol) {
        noonSymbol = symbol;
        noonGap = gap;
      }
    }
  }

  if (high === null && low === null) return null;
  return { condition: conditionFor(noonSymbol), high, low };
}

export function decodeForecast(raw: unknown, now: Date): Weather | null {
  const series = asRecord(asRecord(raw)?.properties)?.timeseries;
  if (!Array.isArray(series) || series.length === 0) return null;

  const first = asRecord(series[0]);
  const firstData = asRecord(first?.data);
  if (!firstData) return null;

  const instant = asRecord(asRecord(firstData.instant)?.details);
  const temperature = asNumber(instant?.air_temperature);
  if (temperature === null) return null;

  const today = rangeOver(series, now);
  const tomorrow = rangeOver(
    series,
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  );

  return {
    temperature,
    condition: conditionFor(symbolOf(firstData)),
    high: today?.high ?? null,
    low: today?.low ?? null,
    wind: asNumber(instant?.wind_speed),
    rain: asNumber(
      asRecord(asRecord(firstData.next_6_hours)?.details)?.precipitation_amount,
    ),
    tomorrow,
  };
}

/** Reads the first hit from a Nominatim `format=jsonv2` search. */
export function decodePlace(raw: unknown): Place | null {
  const first = Array.isArray(raw) ? asRecord(raw[0]) : null;
  if (!first) return null;

  const latitude = asNumber(first.lat);
  const longitude = asNumber(first.lon);
  if (latitude === null || longitude === null) return null;

  const name = typeof first.name === 'string' ? first.name.trim() : '';
  const display =
    typeof first.display_name === 'string' ? first.display_name : '';

  return {
    latitude,
    longitude,
    // `name` is the place itself; `display_name` is the full postal address,
    // of which only the first part belongs in a corner.
    label: name || display.split(',')[0]?.trim() || 'unknown',
  };
}

/* -- Display --------------------------------------------------------------- */

export function toUnit(celsius: number, unit: TemperatureUnit): number {
  return unit === 'fahrenheit' ? celsius * 1.8 + 32 : celsius;
}

/** "21°" — the degree sign without the letter, which a corner has no room for. */
export function formatTemperature(
  celsius: number | null,
  unit: TemperatureUnit,
): string {
  if (celsius === null) return '--°';
  return `${Math.round(toUnit(celsius, unit))}°`;
}

/**
 * Wind in the units that go with the temperature.
 *
 * Somebody reading Fahrenheit is not expecting metres per second, so the one
 * unit choice in settings carries both rather than asking twice for the same
 * preference.
 */
export function formatWind(
  metresPerSecond: number | null,
  unit: TemperatureUnit,
): string | null {
  if (metresPerSecond === null || !Number.isFinite(metresPerSecond)) return null;
  return unit === 'fahrenheit'
    ? `${Math.round(metresPerSecond * 2.23694)} mph`
    : `${Math.round(metresPerSecond * 3.6)} km/h`;
}

/**
 * Rainfall, or nothing at all.
 *
 * A dry forecast returns null rather than "0 mm". The line only exists to warn
 * you, and a readout that spends most of the year announcing no rain trains
 * the eye to stop reading it.
 */
export function formatRain(millimetres: number | null): string | null {
  if (millimetres === null || !Number.isFinite(millimetres) || millimetres <= 0) {
    return null;
  }
  return millimetres < 1
    ? `${millimetres.toFixed(1)} mm`
    : `${Math.round(millimetres)} mm`;
}
