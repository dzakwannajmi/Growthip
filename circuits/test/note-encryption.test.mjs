// Note encryption roundtrip + negative tests.
// Run from circuits/: node test/note-encryption.test.mjs
// Requires ts-check/out (tsc of the shielded module) and build/flat poseidon2 wasm.

import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const CIRCUITS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TS_OUT = join(CIRCUITS_DIR, "ts-check", "out");

const { setCircuitBase } = require(join(TS_OUT, "poseidon2.js"));
setCircuitBase(join(CIRCUITS_DIR, "build", "flat"));
const keysMod = require(join(TS_OUT, "keys.js"));
const { encryptNoteForRecipient, tryDecryptNote, CIPHERTEXT_LEN } = require(
  join(TS_OUT, "noteEncryption.js"),
);

let passed = 0;
let failed = 0;
const ok = (name, cond) => {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}`);
  }
};

async function main() {
  const recipient = await keysMod.deriveShieldedKeys(new Uint8Array(32).fill(3));
  const stranger = await keysMod.deriveShieldedKeys(new Uint8Array(32).fill(9));
  const d = keysMod.DEFAULT_DIVERSIFIER;

  const amount = 1_000_000n;
  const blinding = 0x1234567890abcdefn;

  // 1. Roundtrip with correct ivk.
  const blob = await encryptNoteForRecipient(recipient.pkD, d, amount, blinding);
  ok("ciphertext is fixed length (147)", blob.length === CIPHERTEXT_LEN);

  const dec = await tryDecryptNote(recipient.ivk, blob);
  ok("recipient decrypts", dec !== null);
  ok("amount roundtrips", dec && dec.amount === amount);
  ok("blinding roundtrips", dec && dec.blinding === blinding);
  ok("diversifier roundtrips", dec && dec.d.length === 11 && dec.d.every((b) => b === 0));

  // 2. Wrong ivk -> null, no throw.
  const wrong = await tryDecryptNote(stranger.ivk, blob);
  ok("stranger gets null (not their note)", wrong === null);

  // 3. Tampered ciphertext -> null (AEAD tag fails).
  const tampered = Uint8Array.from(blob);
  tampered[tampered.length - 1] ^= 0xff;
  const tamperedDec = await tryDecryptNote(recipient.ivk, tampered);
  ok("tampered ciphertext -> null", tamperedDec === null);

  // 4. Tampered epk (first bytes) -> null.
  const badEpk = Uint8Array.from(blob);
  badEpk[0] ^= 0xff;
  const badEpkDec = await tryDecryptNote(recipient.ivk, badEpk);
  ok("corrupted epk -> null", badEpkDec === null);

  // 5. Wrong length blob -> null.
  ok("short blob -> null", (await tryDecryptNote(recipient.ivk, new Uint8Array(10))) === null);

  // 6. Two outputs (tip + change) encrypt independently and each decrypts to
  //    the right owner only.
  const sender = await keysMod.deriveShieldedKeys(new Uint8Array(32).fill(7));
  const tipBlob = await encryptNoteForRecipient(recipient.pkD, d, 300_000n, 0xaaaan);
  const changeBlob = await encryptNoteForRecipient(sender.pkD, d, 700_000n, 0xbbbbn);

  const tipForRecipient = await tryDecryptNote(recipient.ivk, tipBlob);
  const tipForSender = await tryDecryptNote(sender.ivk, tipBlob);
  ok("tip decrypts for recipient", tipForRecipient && tipForRecipient.amount === 300_000n);
  ok("tip does NOT decrypt for sender", tipForSender === null);

  const changeForSender = await tryDecryptNote(sender.ivk, changeBlob);
  const changeForRecipient = await tryDecryptNote(recipient.ivk, changeBlob);
  ok("change decrypts for sender (self-note, no ovk needed)", changeForSender && changeForSender.amount === 700_000n);
  ok("change does NOT decrypt for recipient", changeForRecipient === null);

  // 7. Ciphertext randomized across calls (fresh esk + nonce).
  const blob2 = await encryptNoteForRecipient(recipient.pkD, d, amount, blinding);
  const differ = blob.length === blob2.length && blob.some((b, i) => b !== blob2[i]);
  ok("same note encrypts to different ciphertext each time", differ);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
