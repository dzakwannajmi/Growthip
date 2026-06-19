#![no_std]

use core::array;

use soroban_sdk::{
    contract, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    vec, Bytes, BytesN, Env, Vec,
};

const FIELD_ELEMENT_SIZE: usize = 32;
const G1_SIZE: usize = FIELD_ELEMENT_SIZE * 2;
const G2_SIZE: usize = FIELD_ELEMENT_SIZE * 4;
const PROOF_SIZE: usize = G1_SIZE + G2_SIZE + G1_SIZE;

const PUBLIC_INPUTS_LEN: usize = include!(concat!(env!("OUT_DIR"), "/public_inputs_len.rs"));
const IC_LEN: usize = PUBLIC_INPUTS_LEN + 1;

const VERIFICATION_KEY: VerificationKeyBytes =
    include!(concat!(env!("OUT_DIR"), "/verification_key.rs"));

#[derive(Clone)]
pub struct VerificationKey {
    pub alpha: Bn254G1Affine,
    pub beta: Bn254G2Affine,
    pub gamma: Bn254G2Affine,
    pub delta: Bn254G2Affine,
    pub ic: [Bn254G1Affine; IC_LEN],
}

pub struct VerificationKeyBytes {
    pub alpha: [u8; G1_SIZE],
    pub beta: [u8; G2_SIZE],
    pub gamma: [u8; G2_SIZE],
    pub delta: [u8; G2_SIZE],
    pub ic: [[u8; G1_SIZE]; IC_LEN],
}

impl VerificationKeyBytes {
    pub fn verification_key(&self, env: &Env) -> VerificationKey {
        VerificationKey {
            alpha: Bn254G1Affine::from_array(env, &self.alpha),
            beta: Bn254G2Affine::from_array(env, &self.beta),
            gamma: Bn254G2Affine::from_array(env, &self.gamma),
            delta: Bn254G2Affine::from_array(env, &self.delta),
            ic: array::from_fn(|i| Bn254G1Affine::from_array(env, &self.ic[i])),
        }
    }
}

#[derive(Clone)]
#[contracttype]
pub struct Groth16Proof {
    pub a: Bn254G1Affine,
    pub b: Bn254G2Affine,
    pub c: Bn254G1Affine,
}

impl TryFrom<Bytes> for Groth16Proof {
    type Error = ();

    fn try_from(value: Bytes) -> Result<Self, Self::Error> {
        if value.len() != PROOF_SIZE as u32 {
            return Err(());
        }

        let a =
            Bn254G1Affine::from_bytes(value.slice(0..G1_SIZE as u32).try_into().map_err(|_| ())?);

        let b = Bn254G2Affine::from_bytes(
            value
                .slice(G1_SIZE as u32..G1_SIZE as u32 + G2_SIZE as u32)
                .try_into()
                .map_err(|_| ())?,
        );

        let c = Bn254G1Affine::from_bytes(
            value
                .slice(G1_SIZE as u32 + G2_SIZE as u32..)
                .try_into()
                .map_err(|_| ())?,
        );

        Ok(Self { a, b, c })
    }
}

#[contract]
pub struct GrowthipMerkleVerifier;

#[contractimpl]
impl GrowthipMerkleVerifier {
    pub fn verify(env: Env, proof_bytes: Bytes, public_inputs: Vec<BytesN<32>>) -> bool {
        let proof = match Groth16Proof::try_from(proof_bytes) {
            Ok(proof) => proof,
            Err(_) => return false,
        };

        Self::verify_proof(env, proof, public_inputs).unwrap_or(false)
    }

    fn verify_proof(
        env: Env,
        proof: Groth16Proof,
        public_inputs: Vec<BytesN<32>>,
    ) -> Result<bool, ()> {
        if public_inputs.len() != PUBLIC_INPUTS_LEN as u32 {
            return Err(());
        }

        let vk = VERIFICATION_KEY.verification_key(&env);
        let bn = env.crypto().bn254();

        if public_inputs.len() + 1 != vk.ic.len() as u32 {
            return Err(());
        }

        let mut vk_x = vk.ic[0].clone();

        for (input, ic_point) in public_inputs.iter().zip(vk.ic.iter().skip(1)) {
            let scalar = Bn254Fr::from_bytes(input);
            let prod = bn.g1_mul(ic_point, &scalar);
            vk_x = bn.g1_add(&vk_x, &prod);
        }

        let neg_a = -proof.a;

        let g1_points = vec![&env, neg_a, vk.alpha, vk_x, proof.c];
        let g2_points = vec![&env, proof.b, vk.beta, vk.gamma, vk.delta];

        Ok(bn.pairing_check(g1_points, g2_points))
    }
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use soroban_sdk::{Bytes, BytesN, Env, Vec};

    fn bytes_from_hex(env: &Env, hex_str: &str) -> Bytes {
        let clean = hex_str.trim();
        let raw = hex::decode(clean).expect("invalid hex");
        Bytes::from_slice(env, &raw)
    }

    fn public_inputs_from_hex(env: &Env, hex_str: &str) -> Vec<BytesN<32>> {
        let clean = hex_str.trim();

        assert!(
            clean.len() % 64 == 0,
            "public input hex length must be multiple of 64"
        );

        let mut out = Vec::new(env);

        for chunk_start in (0..clean.len()).step_by(64) {
            let chunk = &clean[chunk_start..chunk_start + 64];
            let raw = hex::decode(chunk).expect("invalid public input hex");
            let arr: [u8; 32] = raw.try_into().expect("public input must be 32 bytes");
            out.push_back(BytesN::from_array(env, &arr));
        }

        out
    }

    #[test]
    fn test_verify_growthip_merkle_note_v2_proof() {
        let env = Env::default();

        let contract_id = env.register(GrowthipMerkleVerifier, ());
        let client = GrowthipMerkleVerifierClient::new(&env, &contract_id);

        let proof_hex =
            include_str!("../../../circuits/build/growthip_merkle_note_v2_proof_abc.hex");
        let public_inputs_hex =
            include_str!("../../../circuits/build/growthip_merkle_note_v2_public_inputs.hex");

        let proof_bytes = bytes_from_hex(&env, proof_hex);
        let public_inputs = public_inputs_from_hex(&env, public_inputs_hex);

        assert_eq!(client.verify(&proof_bytes, &public_inputs), true);
    }
}
