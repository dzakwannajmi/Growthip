# Growthip Testnet Deployment

Network: Stellar Testnet  
Source Account Alias: najmi

## Contract IDs

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

## Initialized State

Current root:

```txt
08e4a3225b89097da6fde1da9e0dddac702af715a4213aed88a4ff698bfecb6d
```

Token:

```txt
CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
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

## Notes

The deployed testnet contracts currently prove that:

- Growthip verifier v2 is deployed on Stellar Testnet
- GrowthipPool is deployed on Stellar Testnet
- GrowthipPool is initialized with the v2 Merkle root
- GrowthipPool is configured with the native XLM token contract
- The contract state is readable from testnet

The next milestone is a testnet deposit and claim transaction using `deposit_paid` and `claim_to`.
