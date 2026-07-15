# Growthip Web

Next.js 16 frontend for Growthip — dashboard, ZK proof generation,
end-to-end note encryption, and multi-wallet integration (Freighter + xBull), all
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
* **@stellar/freighter-api** — Freighter wallet integration (kept for network detection)
* **@creit.tech/stellar-wallets-kit** — unified multi-wallet abstraction (Freighter + xBull)
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
│                             # on-chain Poseidon host function. OUTDATED
│                             # CITATION: this used to point to
│                             # contracts/growthip-pool/src/poseidon_verify_test.rs,
│                             # but that crate was removed in the V4→V5
│                             # migration. Likely replacement:
│                             # contracts/poseidon2/src/parity_test.rs
│                             # (same stated purpose — pins reference
│                             # vectors against the circuit's hash) but
│                             # this wasn't independently confirmed.
├── merkle.ts                  # getMerklePath() — sparse O(N×DEPTH) tree,
│                             # depth-20, MAX_LEAVES=1,048,576. Must stay
│                             # consistent with the on-chain tree logic.
│                             # OUTDATED CITATION: this used to point to
│                             # contracts/growthip-pool/src/merkle_verify_test.rs,
│                             # also removed. Likely on-chain counterpart
│                             # now is contracts/pool-v5/src/merkle_onchain_v2.rs,
│                             # not independently confirmed. NOTE:
│                             # getMerklePath() is the function at the
│                             # center of the still-unresolved leafIndex-0
│                             # claim bug — see SECURITY.md's internal
│                             # debug notes before changing this file.
├── zkp.ts                     # generateProof() — wraps snarkjs witness
│                             # calculation + Groth16 proving (4 public
│                             # inputs: root, nullifierHash,
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

See `.env.local` (not committed). **There is currently no `.env.example`
file in the repo** — despite the "Run Locally" section below historically
telling you to copy one. Use the list here directly until one exists.

All variables are read through `src/lib/config.ts` — prefer importing
`config` over reading `process.env` directly elsewhere in the codebase,
so there's a single place to audit when contract addresses change.

### V5 (active) — the live shielded claim/deposit flow

```bash
NEXT_PUBLIC_POOL_V5_XLM_ID=            # Pool V5 — XLM (shielded JoinSplit)
NEXT_PUBLIC_POOL_V5_USDC_ID=           # Pool V5 — USDC. Deployed and
                                        # functional on-chain, but the
                                        # USDC deposit UI is currently
                                        # disabled pending an unresolved
                                        # claim-flow bug — see
                                        # docs/testnet-deployment.md and
                                        # SECURITY.md's internal debug notes
NEXT_PUBLIC_CREATOR_REGISTRY_ID=       # growthip-creator-registry address
NEXT_PUBLIC_TOKEN_ID=                  # Native XLM SAC address
NEXT_PUBLIC_TOKEN_USDC_ID=             # USDC SAC address (testnet)
NEXT_PUBLIC_USDC_ISSUER=               # USDC issuer account — used by
                                        # src/lib/useMarket.ts for price
                                        # lookups, separate from the SAC
                                        # address above
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
```

### V4 (deprecated) — still required, do not remove yet

```bash
NEXT_PUBLIC_POOL_ID=                   # Old pool contract address. Note:
                                        # config.ts's own inline comment
                                        # calls this "GrowthipPool V3", not
                                        # V4 — that inconsistency wasn't
                                        # resolved this session, worth
                                        # double-checking which version is
                                        # actually deployed at this address
NEXT_PUBLIC_POOL_USDC_ID=              # Old USDC pool contract address
NEXT_PUBLIC_VERIFIER_V3_ID=            # Old verifier contract address (var
                                        # name kept as "V3" for backward
                                        # compat with existing .env files —
                                        # which version it actually points
                                        # to has the same "V3 vs V4" question
                                        # as NEXT_PUBLIC_POOL_ID above)
```

These three are declared with `!` (non-optional) in `config.ts` — the app
throws at startup if any are unset, **even though this pool/verifier pair
is deprecated and no longer used for new deposits.** This is presumably
because notes deposited before the V5 migration still need to resolve
through this old pool/verifier to be claimable. Don't remove these from
`.env.local` without confirming that's no longer a concern.

### Not yet deployed (roadmap)

```bash
NEXT_PUBLIC_POOL_EURC_ID=              # EURC pool — code path already
                                        # exists in config.ts and
                                        # dashboard/claim/page.tsx, but no
                                        # EURC pool is deployed yet
NEXT_PUBLIC_TOKEN_EURC_ID=             # EURC SAC — not yet deployed
```

These can be left empty; `config.ts` defaults them to `""` rather than
throwing.

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
touch .env.local
# fill in the variables listed under "Environment Variables" above —
# there is currently no .env.example to copy from. Addresses come from
# docs/testnet-deployment.md (or contracts/README.md for build/deploy
# details).

npm run dev
# http://localhost:3000
```

---

## Wallet Support

* **Freighter** — fully supported. Browser extension for Stellar.
* **xBull Wallet** — fully supported via `@creit.tech/stellar-wallets-kit`. Desktop extension + PWA.
* Both wallets use unified `src/lib/wallet.ts` abstraction — `connectWithWallet(id)`, `signTransaction(xdr)`, `disconnectWallet()`. All signing flows use dynamic imports to avoid SSR issues.
* **WalletModal** (`src/components/WalletModal.tsx`) — custom wallet selector showing Freighter + xBull with PNG icons.
* For E2E testing (supporter + creator), use two separate Chrome profiles — each with its own wallet extension state and localStorage namespace.
* Mainnet detection via `networkPassphrase` polling every 2s — shows a blocking warning overlay if wallet is switched to mainnet.

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
    │                            # Withdraw tab, Personal
    │                            # Link card (QR + copy)
    ├── claim/page.tsx             # Standalone claim flow — detects and
    │                            # decrypts encrypted note bundles
    │                            # automatically, falls back to legacy
    │                            # plaintext/base64 parsing for notes
    │                            # sent before encryption was mandatory
    ├── activity/page.tsx          # Pending/claimed notes list, with an
    │                            # inline claim modal (same
    │                            # decrypt-or-fallback logic as above)
    ├── analytics/page.tsx         # Per-wallet tip stats from localStorage
    │                            # (received, withdrawn, pending), recent
    │                            # tips — gated behind is_premium()
    ├── notes/page.tsx             # Renders the standalone <PendingNotes>
    │                            # component
    └── settings/page.tsx          # Profile (avatar, display name, bio),
                                 # tip link + QR, Security & Private
                                 # Notes (full encryption setup flow)
```

Notes (the `secret`/`nullifier`/`recipientHash` bundle needed to claim a
tip) are stored in the browser's `localStorage`, **namespaced per
connected wallet address** (`growthip:notes:${address}`) — switching the
active wallet account changes which notes are visible. This was a
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
  wallet address. Labeled "Your Wallet Balance" in the dashboard —
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