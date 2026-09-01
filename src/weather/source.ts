/**
 * The two services behind the weather corner, and the terms that come with
 * using them for free.
 *
 * Forecast: MET Norway's Locationforecast. Chosen over the obvious
 * alternatives because it needs no API key — a key shipped inside an APK is a
 * key anyone can read out of it — and because its data is CC BY 4.0, which
 * permits commercial use. Open-Meteo is the friendlier API and was the first
 * choice until its terms settled the question: its free tier is
 * non-commercial only, and this app sells a founder pack.
 *
 * Geocoding: Nominatim, so a typed place name can become coordinates. MET does
 * not geocode.
 *
 * Both are volunteer-funded public services, and both ask the same three
 * things in return, all of which are implemented here:
 *
 *   1. Identify yourself in the User-Agent, with a way to be contacted. A
 *      generic agent is blocked rather than throttled.
 *   2. Do not ask more often than the data changes. The forecast is polled on
 *      the half hour and a place name is geocoded once, ever — see the cache
 *      in useWeather.
 *   3. Attribute. The settings screen credits both.
 *
 * On the web build the User-Agent is silently dropped: browsers forbid setting
 * it from fetch, and the request may be refused or fail CORS. Android sets it
 * properly, which is the platform this is a kiosk for.
 */

import { decodeForecast, decodePlace, type Place, type Weather } from './weather';

const FORECAST_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const GEOCODE_URL = 'https://nominatim.openstreetmap.org/search';

/**
 * Contact information, as both services require. If this app is ever forked
 * and published, this has to change with it — it is how the operators reach
 * whoever is generating the traffic.
 */
const USER_AGENT =
  'kiosk-clock/1.0 (https://github.com/SeraphinHaeuptli/kiosk-clock)';

const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Cap on what either service is allowed to hand back.
 *
 * Neither of them answers with anything close to this: a compact forecast is
 * tens of kilobytes, and a single geocode hit is a few hundred bytes. What
 * does is whatever is really on the other end — a captive portal on café or
 * hotel wifi answers every request with its own page, and a kiosk left behind
 * one asks again every half hour for as long as it sits there. `json()` parses
 * whatever it is handed, and on a phone with a gigabyte of RAM that is the
 * difference between an empty corner and the process being killed.
 *
 * Measured after reading as text rather than from Content-Length, which is set
 * by the same server being distrusted and is absent on a chunked response.
 */
const MAX_RESPONSE_BYTES = 512 * 1024;

export type WeatherFailure = { ok: false; reason: string };
export type WeatherSuccess<T> = { ok: true; value: T };
export type Fetched<T> = WeatherSuccess<T> | WeatherFailure;

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'AbortError' ? 'request timed out' : error.message;
  }
  return 'unknown error';
}

async function getJson(url: string): Promise<Fetched<unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };

    const body = await response.text();
    if (body.length > MAX_RESPONSE_BYTES) {
      return { ok: false, reason: 'response too large' };
    }
    return { ok: true, value: JSON.parse(body) };
  } catch (error) {
    return { ok: false, reason: describe(error) };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * MET asks for no more than four decimal places, and it is not a formality:
 * their cache is keyed on the coordinates, so full float precision turns every
 * request into a cache miss and a fresh computation on their servers. Four
 * decimals is about eleven metres, which is far past what a city needs.
 */
function truncate(value: number): string {
  return value.toFixed(4);
}

export async function fetchWeather(place: Place): Promise<Fetched<Weather>> {
  const url =
    `${FORECAST_URL}?lat=${truncate(place.latitude)}` +
    `&lon=${truncate(place.longitude)}`;

  const response = await getJson(url);
  if (!response.ok) return response;

  const weather = decodeForecast(response.value, new Date());
  return weather
    ? { ok: true, value: weather }
    : { ok: false, reason: 'no forecast in the response' };
}

export async function fetchPlace(query: string): Promise<Fetched<Place>> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: false, reason: 'no place set' };

  const url =
    `${GEOCODE_URL}?q=${encodeURIComponent(trimmed)}` +
    '&format=jsonv2&limit=1&addressdetails=0';

  const response = await getJson(url);
  if (!response.ok) return response;

  const place = decodePlace(response.value);
  return place
    ? { ok: true, value: place }
    : { ok: false, reason: `no such place: ${trimmed}` };
}
