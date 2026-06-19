# Growthip Web

Next.js 16 frontend for Growthip — dashboard, ZK proof generation, and
Freighter wallet integration, all running client-side in the browser.

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
* **@stellar/freighter-api** — Freighter wallet integration
* **@stellar/stellar-sdk** — Stellar address/key utilities

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

## Key Library Files

```text
src/lib/
├── config.ts              # Centralized env var access — read contract
│                           # addresses, RPC URL, network passphrase from
│                           # here, not process.env directly elsewhere
├── tokens.ts               # SUPPORTED_TOKENS — symbol, decimals, baseUnit,
│                           # presets, pool/token contract addresses per
│                           # token. THIS is the source of truth for what
│                           # amounts the UI offers — must match each
│                           # pool's on-chain tip_amount exactly, or every
│                           # deposit from that token will be rejected by
│                           # deposit_paid()'s denomination check
├── poseidon.ts              # hash1/hash2/hash3, computeCommitment(),
│                           # computeNullifierHash(), computeRecipientHash().
│                           # Must stay byte-for-byte consistent with the
│                           # on-chain Poseidon host function — verified by
│                           # contracts/growthip-pool/src/poseidon_verify_test.rs
├── merkle.ts                # buildMerkleTree(), getMerklePathByIndex().
│                           # Fixed depth-3, MAX_LEAVES=8. Must stay
│                           # consistent with the on-chain
│                           # rebuild_merkle_root() — verified by
│                           # contracts/growthip-pool/src/merkle_verify_test.rs
├── zkp.ts                   # generateProof() — wraps snarkjs witness
│                           # calculation + Groth16 proving,
│                           # toClaimArgs() — formats proof for the
│                           # contract's claim_to() call
├── note.ts                  # PrivateNote type, localStorage persistence
│                           # for pending/claimed notes
├── useMarket.ts              # usePrices() — CoinGecko free API, 30s
│                           # refresh. useWalletBalances() — Stellar
│                           # Horizon testnet, 15s refresh
└── growthipPoolClient.ts     # Generated TS binding for the pool contract
                            # (regenerate if the contract interface changes)
```

---

## Environment Variables

See `.env.local` (not committed) or `.env.example` for the template.

```bash
NEXT_PUBLIC_POOL_ID=             # XLM pool contract address
NEXT_PUBLIC_VERIFIER_V3_ID=      # V3 verifier contract address
NEXT_PUBLIC_TOKEN_ID=            # Native XLM SAC address
NEXT_PUBLIC_POOL_USDC_ID=        # USDC pool contract address
NEXT_PUBLIC_TOKEN_USDC_ID=       # USDC SAC address
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
  signing transactions
* **xBull Wallet**, **Albedo** — shown in the connect-wallet modal as
  "coming soon"; not yet integrated. Adding either is a roadmap item via
  [Stellar Wallets Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit)

---

## Dashboard Structure

```text
src/app/
├── (main)/page.tsx              # Public landing page
└── dashboard/
    ├── page.tsx                  # Main dashboard: balances, Send Tip tab,
    │                            # Withdraw tab (both inline, no separate
    │                            # page navigation)
    ├── activity/page.tsx         # Pending/claimed notes list, with an
    │                            # inline claim modal (full ZK proof
    │                            # generation happens in the modal, no
    │                            # page navigation needed)
    └── analytics/page.tsx        # Pool statistics (real on-chain reads),
                                 # recent tips from local note history
```

Notes (the `secret`/`nullifier`/`recipientHash` bundle needed to claim a
tip) are stored in the browser's `localStorage` under
`growthip:notes` — they are never sent anywhere, and clearing browser
storage means losing the ability to claim any pending tip whose note
wasn't saved/exported elsewhere by the user.

---

## Realtime Data Sources

* **Prices** — [CoinGecko free public API](https://www.coingecko.com/en/api),
  refreshed every 30 seconds. No API key required; subject to CoinGecko's
  free-tier rate limits, in which case the UI falls back to the
  last-known price rather than erroring.
* **Wallet balances** — [Stellar Horizon Testnet](https://horizon-testnet.stellar.org),
  refreshed every 15 seconds, queried directly from the connected
  Freighter address.

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