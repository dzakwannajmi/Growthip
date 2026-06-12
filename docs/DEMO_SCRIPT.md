# Growthip Demo Script

Target duration: 2–3 minutes.

## 1. Opening

Growthip is a privacy-preserving creator tipping prototype built on Stellar Soroban.

The idea is simple:

A supporter can send a fixed-value tip into a pool, while the creator later claims it using a zero-knowledge proof. The pool can verify the claim without learning which exact deposit is being claimed.

## 2. Problem

Most creator tipping systems expose the relationship between supporter and creator.

Growthip focuses on relationship privacy.

The contract should know that a valid support note exists, but it should not know the private secret, private nullifier, or exact deposit-to-claim link.

## 3. ZK Flow

Growthip uses a Circom Groth16 proof over BN254.

The current circuit proves:

- the prover knows a secret and nullifier
- the note commitment exists in a Merkle tree
- the nullifierHash is derived correctly
- the claim is bound to a recipientHash

The public outputs are:

```txt
root
nullifierHash
recipientHash
```

## 4. Smart Contract Flow

GrowthipPool checks:

- root matches the current root
- nullifierHash has not been used
- recipientHash matches the registered recipient
- proof is valid through the native BN254 verifier

If all checks pass, the pool transfers the token to the recipient.

## 5. Test Result

All workspace tests pass.

The tests cover:

- native BN254 proof verification
- Merkle proof verification
- token escrow
- wrong root rejection
- double-claim rejection
- wrong recipient rejection

Command:

```bash
cargo test --workspace -- --nocapture
```

## 6. Testnet Deployment

Growthip has been deployed and initialized on Stellar Testnet.

Verifier v2:

```txt
CDZWWGYDPXPABB6XX3TJ265ORLQNHZ6W2P5BZUTEK7XUGTSSWAGMB5B4
```

Growthip Pool:

```txt
CDFAGPSKKJCWJEOGHFYBEWSMSVGQSNXBXPQA45MGHL2ZIQDBQTTHPEFZ
```

Native XLM Token Contract:

```txt
CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

Current root:

```txt
08e4a3225b89097da6fde1da9e0dddac702af715a4213aed88a4ff698bfecb6d
```

## 7. Closing

Growthip is currently a hackathon/testnet prototype.

It is not audited and not production-ready, but the core privacy-preserving escrow logic is already implemented, tested, built to WASM, deployed, and initialized on Stellar Testnet.
