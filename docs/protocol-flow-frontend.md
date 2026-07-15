# Protocol Flow — Browser / Frontend

> Part of the Growthip documentation set. See the [root README](../README.md) for the project overview.

> This is the **browser-side half** of the end-to-end flow — note
> encryption, Merkle path construction, and Groth16 proof generation,
> all client-side with no backend. For what happens once a transaction
> reaches Soroban, see
> [docs/protocol-flow-contracts.md](protocol-flow-contracts.md).

---

## Browser & ZK Circuit Flow Diagram

```mermaid
graph TD
    subgraph Browser ["USER BROWSER"]
        direction TB

        subgraph Supporter ["Supporter Flow"]
            direction TB
            S1["1. Connect Wallet\n(Freighter or xBull)"]
            S2["2. Open /tip/creator-id"]
            S3["3. Select token and amount"]
            S4["4. Encrypt private note\nX25519 ECDH + AES-GCM"]
            S5["5. deposit_paid commitment + encrypted_bundle"]
            S1 --> S2 --> S3 --> S4 --> S5
        end

        subgraph Creator ["Creator Flow"]
            direction TB
            C1["1. Connect Wallet\n(Freighter or xBull)"]
            C2["2. Auto-register recipient hash\nto all token pools"]
            C3["3. Auto-fetch encrypted bundle\nfrom on-chain message field"]
            C4["4. Decrypt note with password\nX25519 private key"]
            C5["5. Generate Groth16 ZK Proof\nBN254 Circom WASM in-browser"]
            C6["6. claim_to recipient + proof + public_inputs"]
            C1 --> C2 --> C3 --> C4 --> C5 --> C6
        end

        subgraph Core ["Browser Core Modules"]
            direction TB
            BC1["keyManagement.ts\nX25519 keygen + AES-GCM wrapping"]
            BC2["merkle.ts\nPoseidon commitment + Merkle path"]
            BC3["zkp.ts\nsnarkjs Groth16 fullProve in WASM"]
            BC4["growthipPoolClient.ts\nSoroban RPC client"]
            BC5["note.ts\nPrivateNote encode/decode + localStorage namespace"]
        end

        Supporter & Creator --> Core
    end

    subgraph ZK ["ZK CIRCUIT V4 - Groth16 BN254"]
        direction TB
        ZK1["Private inputs:\nsecret + nullifier + recipientHash\npathElements + pathIndices"]
        ZK2["commitment = Poseidon secret + nullifier + recipientHash"]
        ZK3["nullifierHash = Poseidon nullifier"]
        ZK4["Merkle membership proof\ndepth-20 incremental tree\n1,048,576 leaves max"]
        ZK5["Public outputs:\nroot + nullifierHash + recipientHash + index"]
        ZK1 --> ZK2 & ZK3
        ZK2 & ZK3 --> ZK4 --> ZK5
    end

    Core --> ZK
    ZK -- "Groth16 proof + public inputs" --> Contracts(["Soroban Contracts\n(full diagram: docs/protocol-flow-contracts.md)"])
    Registry(["GrowthipCreatorRegistry\n(full diagram: docs/protocol-flow-contracts.md)"]) -- "Encryption pubkey on-chain" --> Supporter

    classDef default fill:#ffffff,stroke:#D4D4D4,stroke-width:1.5px,color:#171717
    classDef external fill:#F1F5F9,stroke:#94A3B8,stroke-dasharray: 4 3,color:#475569
    class Contracts,Registry external
    style Browser fill:#F8FAFC,stroke:#E2E8F0
    style Supporter fill:#F0FDF4,stroke:#BBF7D0
    style Creator fill:#FAF5FF,stroke:#DDD6FE
    style Core fill:#F0F9FF,stroke:#BAE6FD
    style ZK fill:#FDF4FF,stroke:#E9D5FF
```

> **Note:** the diagram label above was corrected from a stale "V3.1" to
> "V4" during this doc split — V4 (depth-20 Merkle tree) is the currently
> active circuit; see [docs/zk-circuit.md](zk-circuit.md) for the full
> circuit version history.

---

## Key Browser Modules

The nodes in the `Core` subgraph above map directly to source files —
see [apps/web/README.md](../apps/web/README.md#key-library-files) for
the full file-by-file breakdown of `src/lib/`, including
`keyManagement.ts`, `merkle.ts`, `zkp.ts`, `growthipPoolClient.ts`, and
`note.ts`.

Nothing in this flow — the `secret`, `nullifier`, or the encryption
private key — ever leaves the browser as plaintext. Proof generation
(4–15 seconds on a typical laptop) and note encryption both run entirely
client-side in WASM / Web Crypto, not on any backend service.
