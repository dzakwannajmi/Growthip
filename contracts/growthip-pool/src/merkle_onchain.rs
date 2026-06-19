// On-chain Merkle tree reconstruction for Growthip V3 pool.
//
// Mirrors apps/web/src/lib/merkle.ts EXACTLY:
//   - Fixed depth-3 binary tree, MAX_LEAVES = 8
//   - Internal node = Poseidon(left, right) via hash2 (t=3 arity)
//   - Empty leaf padding = field element 0 (matching EMPTY_LEAF = "0")
//   - Tree rebuilt FROM SCRATCH on every deposit (not incremental) —
//     cheap because MAX_LEAVES is small (7 total hash2 calls: 4+2+1)
//
// Depends on poseidon_constants_generated.rs (T3_* — arity for hash2,
// 2-input Poseidon used for Merkle level hashing) being in scope.

use soroban_sdk::BytesN;

include!("poseidon_constants_generated.rs");

pub const TREE_DEPTH: u32 = 3;
pub const MAX_LEAVES: u32 = 8; // 2^TREE_DEPTH

/// Poseidon hash2(left, right) using the verified t=3 arity constants.
/// Sponge setup matches circomlibjs exactly: state = [0, left, right],
/// output = state[0] after permutation (see poseidon_verify_test.rs,
/// which proves this matches the browser's hash2() byte-for-byte).
fn hash2_onchain(env: &Env, left: &U256, right: &U256) -> U256 {
    let zero = U256::from_u32(env, 0);
    let input: SVec<U256> = vec![env, zero, left.clone(), right.clone()];

    let hazmat = env.crypto_hazmat();
    let result = hazmat.poseidon_permutation(
        &input,
        soroban_sdk::Symbol::new(env, "BN254"),
        T3_T,
        T3_D,
        T3_ROUNDS_F,
        T3_ROUNDS_P,
        &t3_mds(env),
        &t3_round_constants(env),
    );

    result.get(0).expect("poseidon_permutation returned empty result")
}

/// Converts a BytesN<32> commitment (as stored on-chain) into a U256
/// field element for hashing.
fn commitment_to_u256(env: &Env, commitment: &BytesN<32>) -> U256 {
    let bytes: Bytes = commitment.clone().into();
    U256::from_be_bytes(env, &bytes)
}

/// Converts a U256 field element back into BytesN<32> for storage.
fn u256_to_bytes32(_env: &Env, value: &U256) -> BytesN<32> {
    let bytes: Bytes = value.to_be_bytes();
    bytes
        .try_into()
        .unwrap_or_else(|_| panic!("U256 did not fit into 32 bytes"))
}

/// Rebuilds the full depth-3 Merkle tree from `commitments` (in deposit
/// order, oldest first), padding with the empty-leaf value (field 0) up
/// to MAX_LEAVES, and returns only the final root.
///
/// Mirrors `buildMerkleTree()` in merkle.ts: pads leaves, then hashes
/// pairs level by level (layers[0] = leaves, ..., layers[3] = [root]).
///
/// Panics if `commitments.len() > MAX_LEAVES` — callers (deposit_internal)
/// must enforce the pool size limit before reaching this point.
pub fn rebuild_merkle_root(env: &Env, commitments: &SVec<BytesN<32>>) -> BytesN<32> {
    let len = commitments.len();
    assert!(
        len <= MAX_LEAVES,
        "pool exceeds MAX_LEAVES; cannot rebuild fixed-depth tree"
    );

    let zero_field = U256::from_u32(env, 0);

    // Build the padded leaf layer as U256 field elements.
    let mut current: SVec<U256> = SVec::new(env);
    for i in 0..len {
        let c = commitments.get(i).expect("commitment index out of range");
        current.push_back(commitment_to_u256(env, &c));
    }
    while current.len() < MAX_LEAVES {
        current.push_back(zero_field.clone());
    }

    // Hash pairs level by level until a single root remains.
    // MAX_LEAVES=8 -> 4 -> 2 -> 1 (3 levels, matching TREE_DEPTH).
    while current.len() > 1 {
        let mut next: SVec<U256> = SVec::new(env);
        let mut i = 0u32;
        while i < current.len() {
            let left = current.get(i).expect("left node missing");
            let right = current.get(i + 1).expect("right node missing");
            next.push_back(hash2_onchain(env, &left, &right));
            i += 2;
        }
        current = next;
    }

    let root_u256 = current.get(0).expect("tree produced no root");
    u256_to_bytes32(env, &root_u256)
}
