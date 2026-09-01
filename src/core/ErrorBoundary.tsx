import { Component, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { pad2 } from '@/core/format';

/**
 * The last thing between a render that threw and a black screen.
 *
 * React unmounts the whole tree when a render, a lifecycle or a hook throws
 * and nothing above it catches — which in release is a phone left on a dock
 * showing nothing at all, with no message and no way to tell a crashed clock
 * from a dead battery. A clock has one job, and the job survives losing the
 * face, the backdrop, the weather and the settings that chose them.
 *
 * So the fallback is deliberately the least the app can be: no providers, no
 * stored settings, no bundled font, no native module. Everything the boundary
 * needs is either in this file or a pure function, because whatever brought
 * the tree down is quite likely to be reachable from anything richer.
 */

const RETRY_HINT = 'tap to retry';

/** Minute-resolution, and honest about it: no seconds to imply health. */
function FallbackClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // A plain interval rather than the app's own clock hook: this is the code
    // that runs when the app is already broken, so it shares as little with it
    // as possible. Returning the previous date unchanged when the minute has
    // not turned is what keeps that from being a re-render every second for
    // however many hours the device is left in this state.
    const timer = setInterval(() => {
      setNow((current) => {
        const next = new Date();
        return next.getMinutes() === current.getMinutes() ? current : next;
      });
    }, 1_000);

    return () => clearInterval(timer);
  }, []);

  return (
    <Text style={styles.time} allowFontScaling={false}>
      {`${pad2(now.getHours())}:${pad2(now.getMinutes())}`}
    </Text>
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  /**
   * Retrying is a tap, never automatic.
   *
   * A boundary that re-renders its children the moment it catches spins: the
   * same render throws again immediately, and on a device with no one watching
   * it does that for hours. A deliberate touch is also the honest signal that
   * somebody is there to see whether it worked.
   */
  private retry = () => {
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <Pressable
        style={styles.root}
        onPress={this.retry}
        accessibilityRole="button"
        accessibilityLabel="Retry the clock"
      >
        <FallbackClock />
        <Text style={styles.hint} allowFontScaling={false}>
          {RETRY_HINT}
        </Text>
      </Pressable>
    );
  }
}

/**
 * Hardcoded rather than taken from the palette, and no `fontFamily` at all: a
 * bundled font that failed to load is one of the things that can put the app
 * here, and asking for it again would be asking the same question twice.
 */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: {
    color: '#e8e8e8',
    fontSize: 64,
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    color: 'rgba(232,232,232,0.35)',
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 24,
  },
});
