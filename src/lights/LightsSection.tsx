import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import type { LightsSlider } from '@/clock/settings';
import { label, type Tone } from '@/design/palette';
import { space, type } from '@/design/tokens';
import {
  ActionRow,
  CheckRow,
  ChoiceRow,
  Heading,
  StatusRow,
  TextRow,
  type Choice,
} from '@/ui/Terminal';

import { lightsStatusLine } from './lights';
import { useBridgeSetup } from './useBridgeSetup';
import { useLampSetup } from './useLampSetup';
import { useLights } from './useLights';
import { useSource } from './store';

/**
 * Setting up the lights, and deciding where their slider goes.
 *
 * Its own component because it is the only part of settings with work in
 * flight: a scan, a button press on a physical box, a lamp that has to be
 * awake. Inline in the settings screen it would be three hooks and two
 * hundred lines of conditional rows in the middle of a file that is otherwise
 * a flat list of toggles.
 *
 * Two kinds of light, and which one someone has is a fact about their shelf
 * rather than a preference: lamps with Bluetooth in them, or a bridge. So
 * both ways in are offered until one of them works, and then only that one is
 * shown.
 */

const PLACEMENTS: readonly Choice<LightsSlider>[] = [
  { id: 'off', name: 'off' },
  { id: 'beside', name: 'beside volume' },
  { id: 'instead', name: 'instead of volume' },
];

const LAMP_NOTE =
  'hue lamps made since about 2019 have bluetooth in them, and that is what ' +
  'this uses: the phone talks to each lamp itself, up to ten of them, with no ' +
  'bridge anywhere. they have to be awake and in the same room — a lamp ' +
  'switched off at the wall cannot be found or driven by anything.';

const LAMP_PAIR_NOTE =
  'the first connection may ask android to pair with a lamp. if one refuses, ' +
  'make it discoverable from the hue app (settings, voice assistants) and try ' +
  'again — that is the same step the hue app uses to hand a lamp to alexa, ' +
  'and it leaves your own setup alone.';

const LAMP_PERMISSION_NOTE =
  'finding lamps asks for bluetooth permission, which is the only thing in ' +
  'this app that prompts for anything. it is asked here and never at launch. ' +
  'the scan is declared as never being used to work out where you are, which ' +
  'is why there is no location permission attached to it.';

const BRIDGE_NOTE =
  'a bridge is the white square box. it needs to be on the same wifi as this ' +
  'phone, and one press of the round button on it, which is what hands this ' +
  'app a key of its own. the key stays on this phone, and the bridge can be ' +
  'made to forget it from the hue app, where the apps holding one are listed.';

const BRIDGE_LOOKUP_NOTE =
  'finding it asks philips which bridges share this network, and that is the ' +
  'one part of this that leaves it: the request shows them the address your ' +
  'internet connection already shows every site you open, and nothing else. ' +
  'typing the bridge address skips it.';

/* -- Bluetooth lamps -------------------------------------------------------- */

function LampRows({ tone, chosen }: { tone: Tone; chosen: boolean }) {
  const lamps = useLampSetup();

  const unchosen = useMemo(
    () =>
      lamps.found.filter(
        (found) => !lamps.chosen.some((it) => it.address === found.address),
      ),
    [lamps.found, lamps.chosen],
  );

  const confirmForget = () => {
    Alert.alert(
      'forget these lamps?',
      'the slider stops working until you pick them again. the pairing itself belongs to android and stays, so picking them again does not mean pairing again.',
      [
        { text: 'cancel', style: 'cancel' },
        { text: 'forget', style: 'destructive', onPress: lamps.forget },
      ],
    );
  };

  return (
    <>
      {lamps.chosen.map((lamp) => {
        const reported = lamps.live.lamps.find(
          (it) => it.address === lamp.address,
        );
        return (
          <CheckRow
            key={lamp.address}
            title={lamp.name}
            hint={reported?.connected ? 'connected' : 'not answering'}
            checked
            onChange={() => lamps.toggle(lamp)}
            tone={tone}
          />
        );
      })}

      {unchosen.map((found) => (
        <CheckRow
          key={found.address}
          title={found.name ?? 'hue lamp'}
          // The address, because two lamps of the same model advertise the
          // same name and this is the only thing that tells them apart until
          // one of them has been connected to and asked what it is called.
          hint={found.address.toLowerCase()}
          checked={false}
          onChange={() => lamps.toggle(found)}
          tone={tone}
        />
      ))}

      <ActionRow
        title={
          lamps.busy === 'scanning'
            ? 'looking for lamps...'
            : lamps.busy === 'asking'
              ? 'waiting for permission...'
              : chosen
                ? 'look for more lamps'
                : 'find my lamps'
        }
        onPress={lamps.scan}
      />

      {chosen && (
        <ActionRow title="forget these lamps" onPress={confirmForget} />
      )}

      {lamps.problem && <StatusRow title="last attempt" value={lamps.problem} />}

      <Text style={styles.note}>{LAMP_NOTE}</Text>
      {!chosen && <Text style={styles.note}>{LAMP_PERMISSION_NOTE}</Text>}
      {chosen && <Text style={styles.note}>{LAMP_PAIR_NOTE}</Text>}
    </>
  );
}

/* -- A bridge --------------------------------------------------------------- */

function BridgeRows({ tone, chosen }: { tone: Tone; chosen: boolean }) {
  const bridge = useBridgeSetup();
  const [address, setAddress] = useState('');

  const link = bridge.link;
  const groups = bridge.groups;

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

  if (link) {
    return (
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

        {bridge.busy === 'listing' ? (
          <StatusRow title="rooms" value="reading..." />
        ) : (
          <ActionRow title="read the rooms again" onPress={bridge.refresh} />
        )}

        <ActionRow title="forget this bridge" onPress={confirmForget} />
        {bridge.problem && (
          <StatusRow title="last attempt" value={bridge.problem} />
        )}
      </>
    );
  }

  return (
    <>
      <ActionRow
        title={
          bridge.busy === 'searching'
            ? 'looking for a bridge...'
            : chosen
              ? 'find my bridge'
              : 'or find my bridge'
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

      {bridge.problem && (
        <StatusRow title="last attempt" value={bridge.problem} />
      )}
      <Text style={styles.note}>{BRIDGE_NOTE}</Text>
      <Text style={styles.note}>{BRIDGE_LOOKUP_NOTE}</Text>
    </>
  );
}

/* -- The section itself ----------------------------------------------------- */

export function LightsSection({
  placement,
  onPlacement,
  tone,
}: {
  placement: LightsSlider;
  onPlacement: (next: LightsSlider) => void;
  tone: Tone;
}) {
  const { source } = useSource();
  // The same reading the bar behind this modal shows, so the status line
  // reports the real state of the real lights rather than only what is stored.
  const lights = useLights(true);

  const kind = source?.kind ?? null;

  return (
    <View>
      <Heading>lights</Heading>

      <StatusRow
        title="philips hue"
        value={
          kind === null
            ? 'nothing set up'
            : lightsStatusLine(lights.status, lights.name)
        }
      />

      {/*
        Both ways in, until one of them has worked. After that only the one
        that did: a phone with lamps on bluetooth has no bridge to look for,
        and offering to find one would be an invitation to break what works.
      */}
      {kind !== 'bridge' && <LampRows tone={tone} chosen={kind === 'lamps'} />}
      {kind !== 'lamps' && <BridgeRows tone={tone} chosen={kind === 'bridge'} />}

      {/*
        The placement comes last on purpose: it is the only row here that does
        nothing until there are lights, and putting it first offered a choice
        about where to show a slider that did not exist yet.
      */}
      <ChoiceRow
        options={PLACEMENTS}
        value={placement}
        onChange={onPlacement}
        tone={tone}
      />
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
