/**
 * Proves the server and the app agree about what a key is.
 *
 * They hold the format separately — the app has to verify without importing
 * anything from a deployment, and the server has to run without the app's
 * module graph — so the one thing worth testing is that the two have not
 * drifted apart. A mismatch here means every key sold is rejected by the app,
 * which is the worst bug this system can have and the least visible.
 *
 *   node server/mint.test.mjs
 */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import ts from 'typescript';

import { mintKey } from './mint.mjs';

ed.hashes.sha512 = sha512;

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

// The app's verifier, compiled from the source the app actually ships.
const TEMP = new URL('./.verifier.mjs', import.meta.url);
writeFileSync(
  TEMP,
  ts.transpileModule(readFileSync('src/billing/licence.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText,
);
const { verifyLicence } = await import(TEMP.href);
unlinkSync(TEMP);

const priv = hex(ed.utils.randomSecretKey());
const pub = hex(ed.getPublicKey(Uint8Array.from(Buffer.from(priv, 'hex'))));

let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

const key = await mintKey('cs_test_session_one', priv);
const read = verifyLicence(key, pub);

check('a minted key verifies in the app', read !== null);
check('key carries the expected prefix', key.startsWith('KIOSK-'));
check('same session mints the same key', key === (await mintKey('cs_test_session_one', priv)));
check(
  'a different session mints a different key',
  key !== (await mintKey('cs_test_session_two', priv)),
);
check(
  'another signing key is rejected',
  verifyLicence(key, hex(ed.getPublicKey(ed.utils.randomSecretKey()))) === null,
);
check('a tampered key is rejected', verifyLicence(key.slice(0, 12) + 'X' + key.slice(13), pub) === null);
check(
  'the reference is not the raw session id',
  read !== null && !'cs_test_session_one'.includes(read.ref),
);

console.log(failures === 0 ? '\nserver and app agree.' : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
