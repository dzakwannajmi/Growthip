#![no_std]

//! Shared contract types for Growthip V5 shielded pool.
//!
//! Adapted from fxjrin/cyphras contracts/types (Apache-2.0). `TxProof`
//! deliberately omits `domain`: the pool supplies its own stored domain as the
//! 4th public input, so a proof cannot replay across pools even if both embed
//! the same verification key.

use soroban_sdk::{
    contracterror, contracttype,
    crypto::bn254::{Bn254G1Affine, Bn254G2Affine},
    Address, Bytes, Vec, U256,
};

/// Uncompressed affine, big-endian, matching the host's BN254 encoding.
#[contracttype]
#[derive(Clone)]
pub struct Groth16Proof {
    pub a: Bn254G1Affine,
    pub b: Bn254G2Affine,
    pub c: Bn254G1Affine,
}

#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum Groth16Error {
    InvalidProof = 0,
    MalformedPublicInputs = 1,
}

/// Proof plus the public signals the pool binds. `domain` is intentionally NOT
/// here — the pool injects it from storage so proofs cannot cross pools.
/// Public-input order the circuit declares:
///   root, publicAmount, extDataHash, domain, inputNullifier[2], outputCommitment[2]
#[contracttype]
#[derive(Clone)]
pub struct TxProof {
    pub a: Bn254G1Affine,
    pub b: Bn254G2Affine,
    pub c: Bn254G1Affine,
    pub root: U256,
    pub public_amount: U256,
    pub ext_data_hash: U256,
    pub input_nullifiers: Vec<U256>,
    pub output_commitments: Vec<U256>,
}

/// External (public) transaction data, bound into the proof via ext_data_hash.
/// ext_amount sign: positive deposit, negative withdrawal, zero transfer.
#[contracttype]
#[derive(Clone)]
pub struct ExtData {
    pub ext_amount: i128,
    pub fee: i128,
    pub recipient: Address,
    pub relayer: Address,
    pub encrypted_output0: Bytes,
    pub encrypted_output1: Bytes,
}
