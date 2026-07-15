# Testnet Deployment

> Part of the Growthip documentation set. See the [root README](../README.md) for the project overview.

---

## Testnet Deployment

### V4 Contracts — deprecated, no longer used by the frontend (deployed with `soroban-sdk 26.0.1`)

| Contract | Address |
|---|---|
| Growthip Merkle Verifier V4 | `CB4HXIPKRSM4ULBWJMUVQWF5NIWG6OIBHVX3ES53QROMA2I3OUD3PY63` |
| Growthip Pool — XLM V4 | `CB5LA7RIMHEGH73TWCLYTOJ5Y5EDXFM7J4VPL75KDRGNAFJPWFTXWAAQ` |
| Growthip Pool — USDC V4 | `CBEQAUR4H63S7RQCB736OFVAZIPPHZXF5HWK6PXGBTVJTJDETKAU7SOO` |
| Growthip Creator Registry | `CDX52ACO6MVXDBC4IS3AG6NIKQASJLY24BED3S5KJEA4PPPAXTWSRGNU` |
| Native XLM Token (SAC) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| USDC Token (Circle) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| Admin / Treasury | `GDPAPDZWAKBXUPCNMI4YHAZ7DS7UOUTPGXAFDSWZG4URRMWHFSQTDQBM` |
| Tip Amount — XLM pool | `100,000,000 stroops = 10 XLM` (base; 5x/10x/20x also accepted) |
| Tip Amount — USDC pool | `2,000,000 stroops = 2 USDC` (base; 5x/10x/20x also accepted) |
| Premium activation fee | `60,000,000 stroops = 6 XLM` (one-time, global per creator) |
| Network | Stellar Testnet |

> Contracts have been redeployed multiple times from earlier versions,
> after three self-discovered issues were found and fixed — a
> root-validation vulnerability, a verifier interface leak, and a
> deposit-amount payout bug. The XLM pool has been redeployed multiple
> times during testnet to expand `MAX_MESSAGE_LEN` (50 → 2048 bytes)
> for encrypted bundle delivery, and to reset the 8-leaf Merkle tree
> as it fills up during testing. V4 pool (depth-20) no longer needs redeployment. See
> [Security History](#security-history-honest-disclosure) below for all
> three, each verified working on real testnet transactions, not just in
> local tests.

> **⚠️ Deprecated as of this update — V4 is no longer used by the frontend.**
> See the V5 section below, which is now the primary, active system.

### V5 Contracts — shielded JoinSplit (primary, active)

Shielded-amount privacy pool: 2-in/2-out JoinSplit (Groth16/BN254,
transaction2x2.circom, 62,807 constraints), Poseidon2 Merkle tree
(CAP-0075 host function), and an in-process `verifier-v5` (Groth16
verification runs as a plain Rust function call compiled into each
pool's own wasm, not a separately deployed contract -- a deliberate
architecture deviation from V4). Deployed and manually verified against
this exact repo state, not assumed:

| Contract | Address |
|---|---|
| Growthip Pool V5 — XLM | `CDPC5X2QR7OTZEVMKF6HRXL5N2CN6BSMJ2RXEPEQUJ42JMO7JEB375DU` |
| Growthip Pool V5 — USDC | `CBEKS4IYO2WTZFAHND33ISPLU4JBZFGJMAO3NMJPPYJJZ6P6B7DUXDSK` |
| Wasm hash (both pools, same binary) | `4f65a1f78801f47f7b2480e14151b929264cb323bf56444c47e955ccbf56a43a` |
| Domain — XLM pool | `1` (replay-protection tag, immutable per pool) |
| Domain — USDC pool | `2` |
| Max deposit (both pools) | `100,000 units` (testnet-generous, no setter after `initialize()`) |
| TVL cap (both pools) | `10,000,000 units` |
| Admin | `GDPAPDZWAKBXUPCNMI4YHAZ7DS7UOUTPGXAFDSWZG4URRMWHFSQTDQBM` (same as V4) |
| Token (both, same SAC as V4) | Native XLM `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` / USDC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

> Both pools' `current_root()` was queried live post-deploy and confirmed
> to equal `119827e780a1850d7b7e34646edc1ce918211c26dda4e13bcd1611f6f81c3680`
> -- the same empty-tree root value locked by local parity tests since
> Day 1 of V5 development, now confirmed identical on live testnet
> infrastructure, not just in local `cargo test` simulation. V5 is a
> parallel, independent system from V4 -- separate contracts, separate
> Merkle trees, separate hash function (Poseidon2 vs V4's Poseidon v1).
> V5 is now the primary, active system; V4 above is deprecated and no
> longer used by the frontend. V5's frontend integration (note discovery,
> `gr` address registration, tip flow) is functional for XLM; the USDC
> claim path has a known unresolved bug (see the UI status note below and,
> for maintainers, `SECURITY.md`'s internal debug notes).

> **UI status note:** the USDC pool listed above is deployed and functional on-chain, but the USDC transfer/deposit UI in the frontend is temporarily disabled pending an unresolved bug in the V5 shielded claim flow (see the roadmap and, for maintainers, `SECURITY.md`'s internal debug notes). Only XLM is exposed for tipping in the current deployed UI.
