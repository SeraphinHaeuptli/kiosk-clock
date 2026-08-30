import { StyleSheet, Text, View } from 'react-native';

import { label, type Tone } from '@/design/palette';
import { mono, numerals, space, type } from '@/design/tokens';

import {
  conditionWord,
  formatRain,
  formatTemperature,
  formatWind,
  type TemperatureUnit,
  type Weather,
} from './weather';

/**
 * The two top corners.
 *
 * Drawn with characters and rules like everything else here — no icon set, no
 * emoji. A weather glyph would be the only pictorial thing in the app, and at
 * corner size the difference between a sun and a sun behind a cloud is a
 * handful of pixels; the word is both smaller and unambiguous.
 *
 * Neither corner announces a failure. A clock that shows an error where the
 * temperature should be is worse than one that shows nothing: the settings
 * screen is where a broken location gets explained, because that is where it
 * can be fixed.
 */

const TEMPERATURE_SIZE = 24;

/** Left: what it is doing now. */
export function WeatherNow({
  weather,
  unit,
  detail,
  tone,
}: {
  weather: Weather | null;
  unit: TemperatureUnit;
  detail: boolean;
  tone: Tone;
}) {
  if (!weather) return null;

  // Rain is dropped when there is none rather than printed as zero, so the
  // second line appears because something is happening.
  const caption = [
    conditionWord(weather.condition),
    ...(detail
      ? [formatWind(weather.wind, unit), formatRain(weather.rain)]
      : []),
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <View style={styles.left}>
      <Text
        allowFontScaling={false}
        style={[styles.temperature, { color: tone.color }]}
      >
        {formatTemperature(weather.temperature, unit)}
      </Text>
      {caption !== '' && (
        <Text allowFontScaling={false} style={styles.caption}>
          {caption}
        </Text>
      )}
    </View>
  );
}

/** Right: where that is, and the rest of the day. */
export function WeatherPlace({
  weather,
  place,
  unit,
  detail,
}: {
  weather: Weather | null;
  place: string;
  unit: TemperatureUnit;
  detail: boolean;
}) {
  if (!weather) return null;

  // Only shown once the forecast actually reaches the end of the day. Early in
  // the morning it does; at half past eleven at night the range is a couple of
  // readings wide and means nothing.
  const range =
    weather.high !== null &&
    weather.low !== null &&
    Math.round(weather.high) !== Math.round(weather.low)
      ? `${formatTemperature(weather.low, unit)} ${formatTemperature(weather.high, unit)}`
      : null;

  return (
    <View style={styles.right}>
      <Text allowFontScaling={false} style={styles.place} numberOfLines={1}>
        {place}
      </Text>
      {range && (
        <Text allowFontScaling={false} style={styles.range}>
          {range}
        </Text>
      )}
      {detail && weather.tomorrow && (
        <Text allowFontScaling={false} style={styles.range}>
          {`tmw ${formatTemperature(weather.tomorrow.low, unit)} ${formatTemperature(weather.tomorrow.high, unit)}`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  left: { alignItems: 'flex-start' },
  right: { alignItems: 'flex-end' },
  temperature: {
    ...numerals,
    fontFamily: mono,
    fontSize: TEMPERATURE_SIZE,
    lineHeight: TEMPERATURE_SIZE * 1.1,
  },
  caption: {
    ...type.tiny,
    color: label.tertiary,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  place: {
    ...type.tiny,
    color: label.secondary,
    letterSpacing: 2,
    textTransform: 'uppercase',
    // Long names are cut rather than allowed to push into the clock.
    maxWidth: 160,
  },
  range: {
    ...numerals,
    fontFamily: mono,
    fontSize: type.tiny.fontSize,
    color: label.tertiary,
    letterSpacing: 1,
    marginTop: space.xs,
  },
});
