/**
 * kdfWorker.ts
 *
 * Runs Argon2id key derivation inside a dedicated Web Worker, off the
 * main thread. Argon2id with our chosen parameters (64MB memory cost)
 * takes long enough to noticeably freeze the UI if run on the main
 * thread -- this worker exists specifically so password/recovery-phrase
 * unlock doesn't block the page.
 *
 * IMPORTANT DESIGN CONSTRAINT: this worker communicates ONLY in raw
 * bytes (Uint8Array) over postMessage, never in CryptoKey objects.
 * CryptoKey objects are spec'd to survive structured-clone (the
 * mechanism postMessage uses), but real-world support for that has had
 * historical bugs and inconsistent behavior across browsers/runtimes
 * for non-extractable EC keys specifically. Raw bytes have no such
 * ambiguity. The caller (keyManagement.ts) imports the returned bytes
 * into a CryptoKey on the MAIN thread after receiving them.
 *
 * This file is intended to be loaded as a Worker via:
 *   new Worker(new URL("./kdfWorker.ts", import.meta.url))
 * (Next.js/Webpack 5+ native worker support -- verify this resolves
 * correctly once wired into the build; see Phase 3 review notes.)
 */

// hash-wasm embeds its compiled WASM binaries as base64 strings inside
// regular JS modules (rather than as separate .wasm files requiring
// bundler-specific loader support). This was specifically chosen after
// argon2-browser failed to bundle under Turbopack -- see
// SECURITY.md / commit history for the "turbopack doesn't support wasm
// files" finding that prompted the switch.
import { argon2id } from "hash-wasm";

export type KdfRequest = {
  requestId: string;
  /** UTF-8 password or recovery-phrase string to derive from. */
  secret: string;
  /** Random salt, as raw bytes (caller-generated, unique per identity). */
  salt: Uint8Array;
  params: {
    time: number;
    mem: number; // KiB
    parallelism: number;
    hashLen: number;
  };
};

export type KdfResponse =
  | { requestId: string; ok: true; hash: Uint8Array }
  | { requestId: string; ok: false; error: string };

self.onmessage = async (event: MessageEvent<KdfRequest>) => {
  const { requestId, secret, salt, params } = event.data;

  try {
    // hash-wasm's argon2id() returns a Uint8Array directly when
    // outputType is "binary" (the default if unspecified is "hex" --
    // explicit here to avoid relying on the library's default).
    const hash = await argon2id({
      password: secret,
      salt,
      parallelism: params.parallelism, // honestly 1; browser WASM argon2
      // implementations do not provide real multi-threaded parallelism
      // without SharedArrayBuffer + cross-origin-isolation, which this
      // app does not set up. See Phase 2 discussion.
      iterations: params.time,
      memorySize: params.mem,
      hashLength: params.hashLen,
      outputType: "binary",
    });

    const response: KdfResponse = {
      requestId,
      ok: true,
      hash: new Uint8Array(hash),
    };
    // Uint8Array (backed by a transferable ArrayBuffer) is safe to
    // postMessage -- no CryptoKey involved, per the design constraint
    // documented above.
    (self as unknown as Worker).postMessage(response, [response.hash.buffer]);
  } catch (err) {
    const response: KdfResponse = {
      requestId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(response);
  }
};

export {};
