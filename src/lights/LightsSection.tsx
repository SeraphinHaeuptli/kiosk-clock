import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import type { LightsSlider } from '@/clock/settings';
import { label, type Tone } from '@/design/palette';
import { space, type } from '@/design/tokens';
import {
  ActionRow,
  ChoiceRow,
  Heading,
  StatusRow,
  TextRow,
  type Choice,
} from '@/ui/Terminal';

import { lightsStatusLine } from './lights';
import { useBridgeSetup } from './useBridgeSetup';
import { useLights } from './useLights';

/**
 * Pairing with a Hue bridge, and where to put the slider it gets you.
 *
 * Its own component because it is the only part of settings with work in
 * flight: a lookup, a button press on a physical box, a list of rooms read
 * back. Inline in the settings screen it would be two hooks and a hundred
 * lines of conditional rows in the middle of a file that is otherwise a flat
 * list of toggles.
 */

const PLACEMENTS: readonly Choice<LightsSlider>[] = [
  { id: 'off', name: 'off' },
  { id: 'beside', name: 'beside volume' },
  { id: 'instead', name: 'instead of volume' },
];

const NOTE =
  'needs the bridge on the same wifi as this phone and one press of the ' +
  'round button on it, which is what hands this app a key of its own. the hue ' +
  'app is not involved after that — it is only how the lights got set up in ' +
  'the first place. the key stays on this phone, and the bridge can be made ' +
  'to forget it from the hue app, where the apps holding one are listed.';

const LOOKUP_NOTE =
  'finding it asks philips which bridges share this network, and that is the ' +
  'one part of this that leaves it: the request shows them the address your ' +
  'internet connection already shows every site you open, and nothing else. ' +
  'typing the bridge address skips it.';

export function LightsSection({
  placement,
  onPlacement,
  tone,
}: {
  placement: LightsSlider;
  onPlacement: (next: LightsSlider) => void;
  tone: Tone;
}) {
  const bridge = useBridgeSetup();
  // The same reading the bar behind this modal shows, so the status line
  // reports the real state of the real lights rather than only what is stored.
  const lights = useLights(true);
  const [address, setAddress] = useState('');

  const groups = bridge.groups;
  const link = bridge.link;

  const rooms = useMemo<readonly Choice<string>[]>(
    () => (groups ?? []).map((group) => ({ id: group.id, name: group.name })),
    [groups],
  );

  // A room renamed in the Hue app comes back under a new name; one deleted
  // comes back not at all, and leaves a picker with nothing selected.
  const lost =
    link !== null &&
    groups !== null &&
    !groups.some((group) => group.id === link.groupId);

  const confirmForget = () => {
    Alert.alert(
      'forget this bridge?',
      'the slider stops working until you pair again. the key itself stays on the bridge until you remove it there.',
      [
        { text: 'cancel', style: 'cancel' },
        { text: 'forget', style: 'destructive', onPress: bridge.forget },
      ],
    );
  };

  if (!bridge.available) {
    return (
      <View>
        <Heading>lights</Heading>
        <StatusRow
          title="philips hue"
          value="not in this build — android only"
        />
      </View>
    );
  }

  return (
    <View>
      <Heading>lights</Heading>

      {link ? (
        <>
          <StatusRow
            title="bridge"
            // The last six of the id, which is what the Hue app shows too, and
            // enough to tell two bridges apart without a line of hex.
            value={`${link.ip} · ${link.id.slice(-6)}`}
          />

          {rooms.length > 0 && (
            <ChoiceRow
              options={rooms}
              value={link.groupId}
              onChange={(id) => {
                const picked = groups?.find((group) => group.id === id);
                if (picked) bridge.choose(picked);
              }}
              tone={tone}
            />
          )}

          {lost && (
            <StatusRow
              title="room"
              value={`${link.groupName} is gone — pick another`}
            />
          )}

          <StatusRow
            title="brightness"
            value={lightsStatusLine(lights.status, lights.name)}
          />

          {bridge.busy === 'listing' ? (
            <StatusRow title="rooms" value="reading..." />
          ) : (
            <ActionRow title="read the rooms again" onPress={bridge.refresh} />
          )}

          <ActionRow title="forget this bridge" onPress={confirmForget} />
        </>
      ) : (
        <>
          <ActionRow
            title={
              bridge.busy === 'searching'
                ? 'looking for a bridge...'
                : 'find my bridge'
            }
            onPress={bridge.find}
          />

          <TextRow
            title="or its address"
            value={address}
            placeholder="192.168.1.2"
            onChangeText={setAddress}
          />
          {address.trim() !== '' && (
            <ActionRow
              title="try that address"
              onPress={() => bridge.use(address)}
            />
          )}

          {bridge.candidate && (
            <>
              <StatusRow
                title="found"
                value={`${bridge.candidate.name} at ${bridge.candidate.ip}${
                  bridge.candidate.others > 0
                    ? ` (+${bridge.candidate.others} more — type an address for those)`
                    : ''
                }`}
              />
              <ActionRow
                title={
                  bridge.busy === 'pairing'
                    ? 'pairing...'
                    : 'press the button on the bridge, then tap here'
                }
                onPress={bridge.pair}
              />
            </>
          )}
        </>
      )}

      {bridge.problem && (
        <StatusRow title="last attempt" value={bridge.problem} />
      )}

      {/*
        The placement comes last on purpose: it is the only row here that does
        nothing until there is a bridge, and putting it first offered a choice
        about where to show a slider that did not exist yet.
      */}
      <ChoiceRow
        options={PLACEMENTS}
        value={placement}
        onChange={onPlacement}
        tone={tone}
      />

      <Text style={styles.note}>{NOTE}</Text>
      {!link && <Text style={styles.note}>{LOOKUP_NOTE}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    ...type.tiny,
    color: label.tertiary,
    lineHeight: 16,
    marginTop: space.sm,
  },
});
