# Growthip Web

Next.js 16 frontend for Growthip — dashboard, ZK proof generation,
end-to-end note encryption, and Freighter wallet integration, all
running client-side in the browser.

For protocol-level design, see the [root README](../../README.md). For
contract addresses and ABI, see [contracts/README.md](../../contracts/README.md).

---

## Stack

* **Next.js 16** (Turbopack) with the App Router
* **TypeScript**, strict mode
* **Tailwind CSS v4**
* **circomlibjs** — browser-side Poseidon hashing (matches the on-chain
  Soroban Poseidon host function byte-for-byte; see
  [SECURITY.md](../../SECURITY.md#self-found-issue-1--root-forgery))
* **snarkjs** — browser-side Groth16 proof generation (WASM)
* **hash-wasm** — Argon2id key derivation for private-note encryption,
  run in a Web Worker. Originally `argon2-browser`, switched after its
  bundled WASM loader proved incompatible with Turbopack (`import { a,
  b } from "a"` in its generated loader) — `hash-wasm` embeds its WASM
  as a base64 string instead of a separate `.wasm` file, sidestepping
  the issue
* **@scure/bip39** — recovery-phrase (mnemonic) generation, audited
* **@stellar/freighter-api** — Freighter wallet integration
* **@stellar/stellar-sdk** — Stellar address/key utilities
* **qrcode.react** — QR codes for tip links, recovery phrases, and
  encrypted note bundles

---

## Why ZK Proving Happens in the Browser

Growthip's privacy model depends on `secret` and `nullifier` never
leaving the user's device. There is no backend service that sees these
values — the Groth16 proof (5–15 seconds on a typical laptop) is
generated entirely client-side using `snarkjs` and the compiled circuit
WASM, then only the proof bytes and public inputs are sent to the
Soroban contract.

This means:

* No backend can act as a man-in-the-middle on the secret/nullifier
* Proof generation time is bounded by the user's own device, not server
  load
* The circuit WASM and proving key (`.zkey`) must ship to the client —
  these are static assets, not API responses

---

## Why Note Encryption Also Happens in the Browser

Private notes (the `secret`/`nullifier`/`recipientHash` bundle needed to
claim a tip) are now encrypted end-to-end before being shared via a
URL/QR code, using X25519 ECDH + HKDF + AES-GCM (`src/lib/encryption/`).
The same zero-backend principle applies: a supporter's browser encrypts
directly against the creator's public key (read from
`growthip-creator-registry`), and only the creator's own browser,
holding the matching private key, can decrypt it. See
[SECURITY.md](../../SECURITY.md) for the full design writeup, including
why the creator's encryption private key is wrapped under both a
password *and* an independent recovery phrase (an "OR gate," not a
single derivation path), and why it's never written to IndexedDB in
extractable or even non-extractable `CryptoKey` form — only the
AES-GCM-wrapped raw bytes are persisted; the actual usable key exists
only in memory for the duration of an unlocked session.

---

## Key Library Files

```text
src/lib/
├── config.ts                # Centralized env var access — read contract
│                             # addresses, RPC URL, network passphrase from
│                             # here, not process.env directly elsewhere
├── tokens.ts                 # SUPPORTED_TOKENS — symbol, decimals, baseUnit,
│                             # presets, pool/token contract addresses per
│                             # token. THIS is the source of truth for what
│                             # amounts the UI offers — must match each
│                             # pool's on-chain tip_amount exactly, or every
│                             # deposit from that token will be rejected by
│                             # deposit_paid()'s denomination check
├── poseidon.ts                # hash1/hash2/hash3, computeCommitment(),
│                             # computeNullifierHash(), computeRecipientHash().
│                             # Must stay byte-for-byte consistent with the
│                             # on-chain Poseidon host function — verified by
│                             # contracts/growthip-pool/src/poseidon_verify_test.rs
├── merkle.ts                  # buildMerkleTree(), getMerklePathByIndex().
│                             # Fixed depth-3, MAX_LEAVES=8. Must stay
│                             # consistent with the on-chain
│                             # rebuild_merkle_root() — verified by
│                             # contracts/growthip-pool/src/merkle_verify_test.rs
├── zkp.ts                     # generateProof() — wraps snarkjs witness
│                             # calculation + Groth16 proving (4 public
│                             # inputs as of V3.1: root, nullifierHash,
│                             # recipientHash, index), toClaimArgs() —
│                             # formats proof for claim_to(). Loads the
│                             # circom-generated witness_calculator.js via
│                             # a real <script> tag injection rather than
│                             # `new Function(...)`, since the latter is
│                             # functionally eval() and is blocked by the
│                             # CSP without the much broader 'unsafe-eval'
├── note.ts                    # PrivateNote type, encode/decode,
│                             # localStorage persistence — namespaced per
│                             # connected wallet address
│                             # (growthip:notes:${address}), with
│                             # migrateLegacyNotes() to recover
│                             # pre-namespacing data
├── addressId.ts               # Cosmetic, reversible obfuscation of a
│                             # Stellar address for /tip/[id] links — NOT
│                             # cryptographic privacy, see the file's own
│                             # doc comment and SECURITY.md
├── profile.ts                 # Local-only creator profile (display
│                             # name, bio, avatar variant), namespaced
│                             # per address. Avatars render via DiceBear's
│                             # public HTTP API (bottts-neutral style,
│                             # curated seed list) — not a bundled
│                             # library, after finding @dicebear/core +
│                             # @dicebear/styles would need unverified
│                             # `with { type: "json" }` import-attribute
│                             # support under Turbopack for an identical
│                             # visual result
├── registryClient.ts          # useRegistryClient() hook — builds a
│                             # growthip-creator-registry client,
│                             # mirroring the dashboard's existing
│                             # buildClient pattern for growthip-pool
├── encryption/
│   ├── cryptoUtils.ts          # X25519 keypair gen, ECDH, HKDF,
│   │                          # AES-GCM encrypt/decrypt, key wrapping —
│   │                          # all native Web Crypto API
│   ├── kdfWorker.ts            # Argon2id derivation in a dedicated
│   │                          # Web Worker (64MB memory cost would
│   │                          # otherwise freeze the UI on the main
│   │                          # thread). Communicates only in raw bytes,
│   │                          # never CryptoKey objects, over postMessage
│   ├── keyManagement.ts        # Identity lifecycle: createIdentity(),
│   │                          # unlockWithPassword()/
│   │                          # unlockWithRecoveryPhrase(), session
│   │                          # auto-lock (15 min), encrypted backup
│   │                          # export/import, encryptNoteForRecipient()/
│   │                          # decryptIncomingNote()
│   └── storage.ts              # IndexedDB persistence — stores only
│                              # AES-GCM-wrapped bytes, never a CryptoKey
│                              # object, sidestepping historical browser
│                              # inconsistencies around storing
│                              # non-extractable EC keys via structured
│                              # clone
├── useMarket.ts                # usePrices() — CoinGecko free API, 30s
│                             # refresh. useWalletBalances() — Stellar
│                             # Horizon testnet, 15s refresh
├── growthipPoolClient.ts       # Generated TS binding for the pool
│                             # contract (regenerate if the interface
│                             # changes)
└── growthipCreatorRegistryClient.ts  # Generated TS binding for
                                     # growthip-creator-registry
```

---

## Environment Variables

See `.env.local` (not committed) or `.env.example` for the template.

```bash
NEXT_PUBLIC_POOL_ID=                  # XLM pool contract address
NEXT_PUBLIC_VERIFIER_V3_ID=           # V3.1 verifier contract address
NEXT_PUBLIC_TOKEN_ID=                 # Native XLM SAC address
NEXT_PUBLIC_POOL_USDC_ID=             # USDC pool contract address
NEXT_PUBLIC_TOKEN_USDC_ID=            # USDC SAC address
NEXT_PUBLIC_CREATOR_REGISTRY_ID=      # growthip-creator-registry address
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
```

All variables are read through `src/lib/config.ts` — prefer importing
`config` over reading `process.env` directly elsewhere in the codebase,
so there's a single place to audit when contract addresses change.

> If you redeploy any contract, update these values here **and** in your
> hosting provider's environment variables (e.g. Vercel project
> settings), then trigger a redeploy. A stale env var here means the UI
> silently points at an old, possibly-uninitialized contract.

---

## Content-Security-Policy

`next.config.ts` sets a CSP via custom headers — a "strong baseline"
tier (`script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`), not the
stricter nonce-based variant (tracked as a Phase 4 roadmap item in the
root README). Two non-obvious entries exist only because real browser
testing surfaced them, not because they were anticipated upfront:

* `'wasm-unsafe-eval'` (narrower than the full `'unsafe-eval'`) is
  required for `hash-wasm`'s `WebAssembly.compile()` calls inside the
  Argon2id worker
* `connect-src` includes Iconify's icon-data API domains
  (`api.iconify.design`, `api.simplesvg.com`, `api.unisvg.com`) — every
  `<Icon>` from `@iconify/react` fetches its icon data from these at
  runtime, and omitting them silently breaks icon rendering app-wide

If you add a new external script, font, or fetch target anywhere in the
app, the CSP will likely need a matching directive update here — it does
not auto-discover what the app legitimately needs.

---

## Run Locally

```bash
npm install
cp .env.example .env.local
# fill in addresses from ../../testnet.env or contracts/README.md

npm run dev
# http://localhost:3000
```

---

## Wallet Support

* **Freighter** — fully supported, the only wallet currently wired up for
  signing transactions. Note: Freighter's active account is a single
  global browser-extension state, not per-tab — switching wallets for
  testing (e.g. one as creator, one as supporter) requires either
  separate Chrome *profiles* (not just separate windows, which share one
  profile's extension state), separate browsers, or manually switching
  accounts inside the Freighter popup between actions
* **xBull Wallet**, **Albedo** — shown in the connect-wallet modal as
  "coming soon"; not yet integrated. Adding either is a roadmap item via
  [Stellar Wallets Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit)

---

## Dashboard Structure

```text
src/app/
├── (main)/page.tsx               # Public landing page
├── tip/[id]/page.tsx             # Public, no-login tip page for a
│                                # creator's shareable link. Mandatory
│                                # premium gate: a supporter cannot
│                                # deposit at all if the creator hasn't
│                                # activated private notes (no plaintext
│                                # fallback) — shows a banner + "copy
│                                # link to share with your creator"
│                                # instead
└── dashboard/
    ├── page.tsx                   # Main dashboard: wallet balance,
    │                            # Send Tip tab, Withdraw tab, Personal
    │                            # Link card (QR + copy)
    ├── deposit/page.tsx           # Standalone send-tip flow
    ├── claim/page.tsx             # Standalone claim flow — detects and
    │                            # decrypts encrypted note bundles
    │                            # automatically, falls back to legacy
    │                            # plaintext/base64 parsing for notes
    │                            # sent before encryption was mandatory
    ├── activity/page.tsx          # Pending/claimed notes list, with an
    │                            # inline claim modal (same
    │                            # decrypt-or-fallback logic as above)
    ├── analytics/page.tsx         # Pool statistics (real on-chain
    │                            # reads), recent tips from local note
    │                            # history — gated behind is_premium()
    ├── notes/page.tsx             # Renders the standalone <PendingNotes>
    │                            # component
    └── settings/page.tsx          # Profile (avatar, display name, bio),
                                 # tip link + QR, Security & Private
                                 # Notes (full encryption setup flow)
```

Notes (the `secret`/`nullifier`/`recipientHash` bundle needed to claim a
tip) are stored in the browser's `localStorage`, **namespaced per
connected wallet address** (`growthip:notes:${address}`) — switching the
active Freighter account changes which notes are visible. This was a
real gap fixed during development: storage was previously a single
global key shared across every address in the same browser. They are
never sent anywhere, and clearing browser storage means losing the
ability to claim any pending tip whose note wasn't saved/exported
elsewhere (backup file, copied text, etc.) by the user.

---

## Realtime Data Sources

* **Prices** — [CoinGecko free public API](https://www.coingecko.com/en/api),
  refreshed every 30 seconds. No API key required; subject to CoinGecko's
  free-tier rate limits, in which case the UI falls back to the
  last-known price rather than erroring.
* **Wallet balances** — [Stellar Horizon Testnet](https://horizon-testnet.stellar.org),
  refreshed every 15 seconds, queried directly from the connected
  Freighter address. Labeled "Your Wallet Balance" in the dashboard —
  this is the account's actual on-chain balance, not a running total of
  tips received through Growthip specifically (that figure lives in
  Analytics instead).

Both are client-side fetches with no backend proxy — see
`src/lib/useMarket.ts`.

---

## Build for Production

```bash
npm run build
npm run start
```

The deployed instance (`https://growthip.vercel.app`) is hosted on
Vercel, configured to read the `NEXT_PUBLIC_*` environment variables
listed above from Vercel's project settings.