// On-chain incremental Merkle tree for Growthip V4 pool.
//
// Upgraded from fixed depth-3 (rebuild from scratch) to incremental
// depth-20 (frontier-based update). Only stores the frontier nodes —
// the right-most node at each level — and updates just the path from
// the new leaf to the root (20 Poseidon calls per deposit, regardless
// of tree size).
//
// Matches apps/web/src/lib/merkle.ts EXACTLY:
//   - depth-20 binary tree, MAX_LEAVES = 2^20 = 1,048,576
//   - Internal node = Poseidon(left, right) via hash2 (t=3 arity)
//   - Empty leaf padding = field element 0 (EMPTY_LEAF = "0")
//   - Empty subtree roots precomputed bottom-up from EMPTY_LEAF

use soroban_sdk::BytesN;
include!("poseidon_constants_generated.rs");

pub const TREE_DEPTH: u32 = 20;
pub const MAX_LEAVES: u32 = 1 << TREE_DEPTH; // 1,048,576

/// Poseidon hash2(left, right) — identical to V3 implementation.
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

fn commitment_to_u256(env: &Env, commitment: &BytesN<32>) -> U256 {
    let bytes: Bytes = commitment.clone().into();
    U256::from_be_bytes(env, &bytes)
}

fn u256_to_bytes32(_env: &Env, value: &U256) -> BytesN<32> {
    let bytes: Bytes = value.to_be_bytes();
    bytes.try_into().unwrap_or_else(|_| panic!("U256 did not fit into 32 bytes"))
}

/// Compute the empty subtree root at each level.
/// empty_nodes[0] = EMPTY_LEAF = 0
/// empty_nodes[i] = hash2(empty_nodes[i-1], empty_nodes[i-1])
fn empty_nodes(env: &Env) -> SVec<U256> {
    let mut nodes: SVec<U256> = SVec::new(env);
    let mut current = U256::from_u32(env, 0);
    nodes.push_back(current.clone());
    for _ in 0..TREE_DEPTH {
        current = hash2_onchain(env, &current.clone(), &current.clone());
        nodes.push_back(current.clone());
    }
    nodes
}

/// Insert a new commitment into the incremental Merkle tree.
///
/// `frontier` holds the right-most filled node at each level (depth-20
/// entries). On first deposit all entries are the empty subtree roots.
/// Returns the new root and the updated frontier.
///
/// Algorithm (standard incremental Merkle tree):
///   - Start with the new leaf at level 0
///   - At each level: if the current leaf_index is odd (right child),
///     hash with the frontier node at that level (left sibling);
///     otherwise, hash with the empty subtree root at that level.
///   - Update frontier at the level where the node is a right child.
pub fn insert_leaf(
    env: &Env,
    leaf: &BytesN<32>,
    leaf_index: u32,
    frontier: &SVec<BytesN<32>>,
) -> (BytesN<32>, SVec<BytesN<32>>) {
    let empties = empty_nodes(env);
    let mut current = commitment_to_u256(env, leaf);
    let mut new_frontier: SVec<BytesN<32>> = frontier.clone();
    let mut idx = leaf_index;

    for level in 0..TREE_DEPTH {
        if idx % 2 == 1 {
            // right child: left sibling is frontier[level]
            let left = commitment_to_u256(
                env,
                &frontier.get(level).expect("frontier missing level"),
            );
            current = hash2_onchain(env, &left, &current);
            // update frontier at this level with the left sibling
            // (frontier tracks the last filled left node at each level)
        } else {
            // left child: right sibling is empty subtree root
            let right = empties.get(level).expect("empty node missing");
            // update frontier at this level with current node
            new_frontier.set(level, u256_to_bytes32(env, &current));
            current = hash2_onchain(env, &current, &right);
        }
        idx >>= 1;
    }

    let root = u256_to_bytes32(env, &current);
    (root, new_frontier)
}

/// Initialize an empty frontier (all entries = empty subtree roots).
pub fn empty_frontier(env: &Env) -> SVec<BytesN<32>> {
    let empties = empty_nodes(env);
    let mut frontier: SVec<BytesN<32>> = SVec::new(env);
    for level in 0..TREE_DEPTH {
        frontier.push_back(u256_to_bytes32(
            env,
            &empties.get(level).expect("empty node missing"),
        ));
    }
    frontier
}

/// Compute the empty tree root (all leaves = 0).
pub fn empty_root(env: &Env) -> BytesN<32> {
    let empties = empty_nodes(env);
    u256_to_bytes32(env, &empties.get(TREE_DEPTH).expect("root missing"))
}
