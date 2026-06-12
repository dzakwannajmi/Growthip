# Growthip Architecture

Growthip is a privacy-preserving creator tipping prototype built with Stellar Soroban and zero-knowledge proofs.

## High-Level Flow

```txt
Supporter
  |
  | deposit fixed-value tip + commitment
  v
GrowthipPool Contract
  |
  | stores commitment
  v
Merkle Tree
  |
  | private note is shared off-chain
  v
Creator / Recipient
  |
  | generates ZK proof
  v
GrowthipPool Contract
  |
  | verifies proof through Growthip Merkle Verifier v2
  | checks root
  | checks nullifierHash
  | checks recipientHash
  v
Recipient receives token claim
```

## Main Components

### Circuits

- `growthip_note.circom`
- `growthip_merkle_note.circom`
- `growthip_merkle_note_v2.circom`

The current main circuit is:

```txt
growthip_merkle_note_v2.circom
```

It outputs:

```txt
root
nullifierHash
recipientHash
```

### Contracts

- `growthip-merkle-verifier-v2`
- `growthip-pool`

The verifier checks the Groth16 BN254 proof.

The pool handles:

- commitment deposits
- root validation
- nullifier anti double-claim
- recipient hash binding
- token escrow
- claim execution

## Testnet Deployment

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

Admin Address:

```txt
GDPAPDZWAKBXUPCNMI4YHAZ7DS7UOUTPGXAFDSWZG4URRMWHFSQTDQBM
```

## Current Initialized State

Current root:

```txt
08e4a3225b89097da6fde1da9e0dddac702af715a4213aed88a4ff698bfecb6d
```

Tip amount:

```txt
100000000
```

Total deposits:

```txt
0
```

Total claims:

```txt
0
```

## Current Status

Growthip core contracts have been built, tested, deployed, and initialized on Stellar Testnet.
