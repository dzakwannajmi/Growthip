#![no_std]

//! Groth16/BN254 verifier for Growthip V5, with the verification key embedded
//! at compile time via build.rs.
//!
//! Adapted from fxjrin/cyphras contracts/verifier (Apache-2.0), with ONE
//! deliberate change: the `#[contract]`/`#[contractimpl]` wrapper is REMOVED.
//! This crate is a pure library (`rlib`) exposing only `verify_groth16()`.
//!
//! Why: in Growthip V4, depending on a verifier crate that carried its own
//! `#[contractimpl]` leaked `verify()` as a directly-callable function on the
//! POOL contract's own interface (confirmed via `stellar contract info
//! interface`). A library with no contract type cannot leak an interface into
//! the pool wasm. "Verifier V5" therefore lives INSIDE each pool's wasm, not as
//! a separate deployed contract — a conscious departure from V4's separate
//! Verifier contract.

use soroban_sdk::{
    crypto::bn254::{Bn254Fr, Bn254G1Affine as G1, Bn254G2Affine as G2},
    vec, BytesN, Env, Vec,
};
use zk_types::Groth16Proof;

include!(concat!(env!("OUT_DIR"), "/vk.rs"));

struct VerificationKey {
    alpha: G1,
    beta: G2,
    gamma: G2,
    delta: G2,
    ic: Vec<G1>,
}

fn embedded_vk(env: &Env) -> VerificationKey {
    let mut ic: Vec<G1> = Vec::new(env);
    for bytes in VK_IC.iter() {
        ic.push_back(G1::from_bytes(BytesN::from_array(env, bytes)));
    }
    VerificationKey {
        alpha: G1::from_bytes(BytesN::from_array(env, &VK_ALPHA_G1)),
        beta: G2::from_bytes(BytesN::from_array(env, &VK_BETA_G2)),
        gamma: G2::from_bytes(BytesN::from_array(env, &VK_GAMMA_G2)),
        delta: G2::from_bytes(BytesN::from_array(env, &VK_DELTA_G2)),
        ic,
    }
}

/// Verify a Groth16 proof against the compile-time-embedded key. Returns true
/// only for a valid proof. Library entry so the pool verifies in-process — no
/// cross-contract call, no leaked interface.
pub fn verify_groth16(env: &Env, proof: &Groth16Proof, public_inputs: &Vec<Bn254Fr>) -> bool {
    let vk = embedded_vk(env);
    let bn = env.crypto().bn254();

    // IC carries one extra point for the constant term.
    if public_inputs.len().checked_add(1) != Some(vk.ic.len()) {
        return false;
    }

    let mut vk_x = match vk.ic.get(0) {
        Some(p) => p,
        None => return false,
    };
    for i in 0..public_inputs.len() {
        let s = public_inputs.get(i).unwrap();
        let term = match vk.ic.get(i + 1) {
            Some(t) => t,
            None => return false,
        };
        vk_x = bn.g1_add(&vk_x, &bn.g1_mul(&term, &s));
    }

    #[allow(clippy::arithmetic_side_effects)]
    let neg_a = -proof.a.clone();
    let g1_points = vec![env, neg_a, vk.alpha, vk_x, proof.c.clone()];
    let g2_points = vec![env, proof.b.clone(), vk.beta, vk.gamma, vk.delta];

    bn.pairing_check(g1_points, g2_points)
}
