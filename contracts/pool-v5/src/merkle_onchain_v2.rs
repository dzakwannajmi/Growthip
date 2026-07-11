//! On-chain incremental Merkle tree for Growthip Pool V5.
//!
//! Structurally identical to V4's `merkle_onchain.rs` (depth-20, frontier-based,
//! O(20) per insert) — BUT the hash primitive is swapped from Poseidon **v1**
//! (`poseidon_permutation`, t=3, MDS + generated round constants) to **Poseidon2**
//! (`poseidon2_compress`, CAP-0075 host function). V4 and V5 roots are therefore
//! NOT interchangeable; a V5 pool needs a fresh empty tree.
//!
//! Leaf-zero convention = field element 0, matching transaction2x2.circom and
//! the parity-locked empty root at depth 20:
//!   119827e780a1850d7b7e34646edc1ce918211c26dda4e13bcd1611f6f81c3680
//!
//! Because both this tree and the circuit's MerkleProof use the same
//! poseidon2_compress over the same leaf-zero convention, on-chain roots and
//! in-circuit roots coincide by construction (verified: circuits parity suite +
//! merkle_v2_matches_circuit test).

use poseidon2::poseidon2_compress;
use soroban_sdk::{Env, Vec, U256};

pub const TREE_DEPTH: u32 = 20;
pub const MAX_LEAVES: u32 = 1 << TREE_DEPTH; // 1,048,576

/// Empty subtree root at each level: empties[0] = 0, empties[i] = compress(e,e).
fn empty_nodes(env: &Env) -> Vec<U256> {
    let mut nodes: Vec<U256> = Vec::new(env);
    let mut current = U256::from_u32(env, 0);
    nodes.push_back(current.clone());
    for _ in 0..TREE_DEPTH {
        current = poseidon2_compress(env, current.clone(), current.clone());
        nodes.push_back(current.clone());
    }
    nodes
}

/// Insert one leaf into the incremental tree.
///
/// `frontier` holds the right-most filled node at each level (TREE_DEPTH
/// entries). Returns (new_root, new_frontier). Standard incremental algorithm:
/// at each level, a right child (odd index) hashes with the stored frontier
/// (left sibling); a left child (even index) hashes with the empty subtree root
/// and updates the frontier.
pub fn insert_leaf(
    env: &Env,
    leaf: U256,
    leaf_index: u32,
    frontier: &Vec<U256>,
) -> (U256, Vec<U256>) {
    let empties = empty_nodes(env);
    let mut current = leaf;
    let mut new_frontier: Vec<U256> = frontier.clone();
    let mut idx = leaf_index;

    for level in 0..TREE_DEPTH {
        if idx % 2 == 1 {
            let left = frontier.get(level).expect("frontier missing level");
            current = poseidon2_compress(env, left, current);
        } else {
            let right = empties.get(level).expect("empty node missing");
            new_frontier.set(level, current.clone());
            current = poseidon2_compress(env, current, right);
        }
        idx >>= 1;
    }

    (current, new_frontier)
}

/// Empty frontier: every level seeded with its empty subtree root.
pub fn empty_frontier(env: &Env) -> Vec<U256> {
    let empties = empty_nodes(env);
    let mut frontier: Vec<U256> = Vec::new(env);
    for level in 0..TREE_DEPTH {
        frontier.push_back(empties.get(level).expect("empty node missing"));
    }
    frontier
}

/// Empty tree root (all leaves = 0). Equals the parity-locked constant.
pub fn empty_root(env: &Env) -> U256 {
    let empties = empty_nodes(env);
    empties.get(TREE_DEPTH).expect("root missing")
}
