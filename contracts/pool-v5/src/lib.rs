#![no_std]

//! Growthip Pool V5 — shielded JoinSplit pool (2-in/2-out) on Soroban.
//!
//! Combines the Cyphras `transact()` security model (canonicality checks,
//! reentrancy lock, checks-effects-interactions ordering, TVL cap, on-chain
//! extDataHash recompute, per-pool domain replay protection) with Growthip V4
//! conventions (root-history ring buffer, per-nullifier persistent entries,
//! privacy-safe events, admin/upgrade/pause surface).
//!
//! The Groth16 verifier is linked as a LIBRARY (verifier-v5, no #[contract]),
//! so no `verify()` interface leaks onto this pool's own contract interface —
//! the V4 leak that the local VerifierClient hack worked around no longer
//! exists at all in V5.

mod merkle_onchain_v2;
use merkle_onchain_v2::{empty_frontier, empty_root, insert_leaf, MAX_LEAVES};

use poseidon2::constants::bn256_modulus;
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token::TokenClient,
    xdr::ToXdr, Address, Bytes, BytesN, Env, Vec, U256,
};
use zk_types::{ExtData, Groth16Proof, TxProof};

/// Number of historical roots kept for proof validation (matches V4).
pub const ROOT_HISTORY_SIZE: u32 = 64;

#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    UnknownRoot = 4,
    SpentNullifier = 5,
    WrongExtHash = 6,
    WrongPublicAmount = 7,
    InvalidProof = 8,
    DepositTooLarge = 9,
    BadExtData = 10,
    Reentrancy = 11,
    TreeFull = 12,
    NonCanonicalInput = 13,
    BadDomain = 14,
    Paused = 15,
    BadConfig = 16,
    NotAdmin = 17,
    MalformedProof = 18,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Domain,
    MaxDeposit,
    TvlCap,
    Tvl,
    Paused,
    Lock,
    CurrentRoot,
    RootHistory,
    Frontier,
    NextLeafIndex,
    TotalNullifiers,
    NullifierUsed(U256),
    EncKey(Address),
}

/// Privacy-safe deposit/commitment event: index + commitment + ciphertext for
/// client-side note discovery (trial-decrypt), never the depositor address.
#[contractevent(topics = ["commitment"], data_format = "map")]
pub struct NewCommitment {
    pub index: u32,
    pub commitment: U256,
    pub encrypted_output: Bytes,
}

/// Privacy-safe spend event: nullifier only, never the spender address.
#[contractevent(topics = ["nullifier"], data_format = "single-value")]
pub struct NewNullifier {
    pub nullifier: U256,
}

#[contracttype]
#[derive(Clone)]
pub struct RegisteredEncKey {
    pub version: u32,
    pub value: BytesN<32>,
}

#[contract]
pub struct PoolV5;

#[contractimpl]
impl PoolV5 {
    /// Initialize the pool. `domain` MUST be unique per pool (XLM V5 != USDC V5)
    /// and non-zero/canonical — this is the cross-pool replay guard.
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        domain: U256,
        max_deposit: i128,
        tvl_cap: i128,
    ) -> Result<(), Error> {
        let s = env.storage().instance();
        if s.has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        if domain == U256::from_u32(&env, 0) || domain >= bn256_modulus(&env) {
            return Err(Error::BadDomain);
        }
        if max_deposit <= 0 || tvl_cap < max_deposit {
            return Err(Error::BadConfig);
        }
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Token, &token);
        s.set(&DataKey::Domain, &domain);
        s.set(&DataKey::MaxDeposit, &max_deposit);
        s.set(&DataKey::TvlCap, &tvl_cap);
        s.set(&DataKey::Tvl, &0i128);
        s.set(&DataKey::Paused, &false);
        s.set(&DataKey::TotalNullifiers, &0u32);
        s.set(&DataKey::NextLeafIndex, &0u32);

        let frontier = empty_frontier(&env);
        s.set(&DataKey::Frontier, &frontier);
        let root0 = empty_root(&env);
        s.set(&DataKey::CurrentRoot, &root0);
        let mut history: Vec<U256> = Vec::new(&env);
        history.push_back(root0);
        s.set(&DataKey::RootHistory, &history);
        Ok(())
    }

    fn require_admin(env: &Env) -> Result<Address, Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        Ok(admin)
    }

    pub fn set_paused(env: Env, paused: bool) -> Result<(), Error> {
        Self::require_admin(&env)?;
        env.storage().instance().set(&DataKey::Paused, &paused);
        Ok(())
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        Self::require_admin(&env)?;
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    /// The shielded JoinSplit entry point. Deposit (ext_amount > 0), withdraw
    /// (< 0), or internal transfer (== 0). Spends two input notes, inserts two
    /// output notes.
    pub fn transact(env: Env, proof: TxProof, ext: ExtData, sender: Address) -> Result<(), Error> {
        sender.require_auth();

        // Reentrancy lock: token transfers below call an external contract.
        let t = env.storage().temporary();
        if t.has(&DataKey::Lock) {
            return Err(Error::Reentrancy);
        }
        t.set(&DataKey::Lock, &true);

        let s = env.storage().instance();
        if s.get(&DataKey::Paused).unwrap_or(false) {
            return Err(Error::Paused);
        }
        let token: Address = s.get(&DataKey::Token).ok_or(Error::NotInitialized)?;
        let domain: U256 = s.get(&DataKey::Domain).ok_or(Error::NotInitialized)?;
        let this = env.current_contract_address();

        // ── ExtData shape ──────────────────────────────────────────────────
        if ext.fee < 0 {
            return Err(Error::BadExtData);
        }
        let signed = ext.ext_amount.checked_sub(ext.fee).ok_or(Error::BadExtData)?;

        // ── Structural: exactly 2 nullifiers + 2 commitments ───────────────
        if proof.input_nullifiers.len() != 2 || proof.output_commitments.len() != 2 {
            return Err(Error::MalformedProof);
        }

        // ── Canonicality (x < p) for EVERY public input ────────────────────
        // Non-canonical inputs would let a proof bind a value other than the
        // one checked on-chain, since x and x+p map to the same field element.
        let p = bn256_modulus(&env);
        if proof.root >= p || proof.public_amount >= p || proof.ext_data_hash >= p {
            return Err(Error::NonCanonicalInput);
        }
        for n in proof.input_nullifiers.iter() {
            if n >= p {
                return Err(Error::NonCanonicalInput);
            }
        }
        for c in proof.output_commitments.iter() {
            if c >= p {
                return Err(Error::NonCanonicalInput);
            }
        }

        // ── TVL accounting (real custody = signed) ─────────────────────────
        let max: i128 = s.get(&DataKey::MaxDeposit).ok_or(Error::NotInitialized)?;
        let cap: i128 = s.get(&DataKey::TvlCap).ok_or(Error::NotInitialized)?;
        if ext.ext_amount > max {
            return Err(Error::DepositTooLarge);
        }
        let mut tvl: i128 = s.get(&DataKey::Tvl).unwrap_or(0);
        tvl = tvl.checked_add(signed).ok_or(Error::BadExtData)?;
        if tvl < 0 {
            return Err(Error::BadExtData);
        }
        if tvl > cap {
            return Err(Error::DepositTooLarge);
        }

        // ── Tree capacity (two leaves inserted per transact) ───────────────
        let next_leaf: u32 = s.get(&DataKey::NextLeafIndex).ok_or(Error::NotInitialized)?;
        if next_leaf + 2 > MAX_LEAVES {
            return Err(Error::TreeFull);
        }

        // ── Root must be one this pool actually produced ───────────────────
        if !Self::is_known_root_inner(&env, &proof.root) {
            return Err(Error::UnknownRoot);
        }

        // ── Nullifiers must be unspent ─────────────────────────────────────
        for n in proof.input_nullifiers.iter() {
            if env
                .storage()
                .persistent()
                .has(&DataKey::NullifierUsed(n.clone()))
            {
                return Err(Error::SpentNullifier);
            }
        }

        // ── extDataHash recomputed on-chain, not trusted from input ────────
        if Self::hash_ext_data(&env, &ext) != proof.ext_data_hash {
            return Err(Error::WrongExtHash);
        }

        // ── publicAmount must match signed value's field encoding ──────────
        if Self::calc_public_amount(&env, signed) != proof.public_amount {
            return Err(Error::WrongPublicAmount);
        }

        // ── Groth16 verification (in-process; domain injected here) ────────
        let g16 = Groth16Proof {
            a: proof.a.clone(),
            b: proof.b.clone(),
            c: proof.c.clone(),
        };
        let public_inputs = Self::public_inputs(&env, &proof, &domain);
        if !verifier_v5::verify_groth16(&env, &g16, &public_inputs) {
            return Err(Error::InvalidProof);
        }

        // ════ EFFECTS: all state commits BEFORE any funds move ═════════════
        s.set(&DataKey::Tvl, &tvl);

        let mut total_null: u32 = s.get(&DataKey::TotalNullifiers).unwrap_or(0);
        for n in proof.input_nullifiers.iter() {
            env.storage()
                .persistent()
                .set(&DataKey::NullifierUsed(n.clone()), &true);
            total_null += 1;
            NewNullifier { nullifier: n }.publish(&env);
        }
        s.set(&DataKey::TotalNullifiers, &total_null);

        let c0 = proof.output_commitments.get(0).ok_or(Error::MalformedProof)?;
        let c1 = proof.output_commitments.get(1).ok_or(Error::MalformedProof)?;
        let i0 = Self::insert_commitment(&env, c0.clone());
        let i1 = Self::insert_commitment(&env, c1.clone());
        NewCommitment {
            index: i0,
            commitment: c0,
            encrypted_output: ext.encrypted_output0.clone(),
        }
        .publish(&env);
        NewCommitment {
            index: i1,
            commitment: c1,
            encrypted_output: ext.encrypted_output1.clone(),
        }
        .publish(&env);

        // ════ INTERACTIONS: funds move LAST ════════════════════════════════
        let token_client = TokenClient::new(&env, &token);
        if ext.ext_amount > 0 {
            token_client.transfer(&sender, &this, &ext.ext_amount);
        } else if ext.ext_amount < 0 {
            let out = ext.ext_amount.checked_neg().ok_or(Error::BadExtData)?;
            token_client.transfer(&this, &ext.recipient, &out);
        }
        if ext.fee > 0 {
            token_client.transfer(&this, &ext.relayer, &ext.fee);
        }

        t.remove(&DataKey::Lock);
        Ok(())
    }

    /// Register or rotate the caller's note-viewing pubkey (for `gr` stealth
    /// discovery). Versioned + owner-authorized: cannot be front-run, and a
    /// newer version always supersedes.
    pub fn register_enc_key(
        env: Env,
        owner: Address,
        version: u32,
        pubkey: BytesN<32>,
    ) -> Result<(), Error> {
        owner.require_auth();
        let s = env.storage().persistent();
        let key = DataKey::EncKey(owner);
        if let Some(prev) = s.get::<_, RegisteredEncKey>(&key) {
            if version <= prev.version {
                return Err(Error::BadConfig);
            }
        }
        s.set(&key, &RegisteredEncKey { version, value: pubkey });
        Ok(())
    }

    pub fn current_root(env: Env) -> U256 {
        env.storage()
            .instance()
            .get(&DataKey::CurrentRoot)
            .expect("not initialized")
    }

    pub fn is_known_root(env: Env, root: U256) -> bool {
        Self::is_known_root_inner(&env, &root)
    }

    pub fn is_nullifier_spent(env: Env, nullifier: U256) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::NullifierUsed(nullifier))
    }

    pub fn get_enc_key(env: Env, owner: Address) -> Option<RegisteredEncKey> {
        env.storage().persistent().get(&DataKey::EncKey(owner))
    }
}

// Internal helpers live in a PLAIN impl block (outside #[contractimpl]) so they
// are never exported as contract entry points and the macro never sees them.
impl PoolV5 {
    fn is_known_root_inner(env: &Env, root: &U256) -> bool {
        if *root == U256::from_u32(env, 0) {
            return false;
        }
        let history: Vec<U256> = env
            .storage()
            .instance()
            .get(&DataKey::RootHistory)
            .unwrap_or_else(|| Vec::new(env));
        for r in history.iter() {
            if r == *root {
                return true;
            }
        }
        false
    }

    fn insert_commitment(env: &Env, commitment: U256) -> u32 {
        let s = env.storage().instance();
        let index: u32 = s.get(&DataKey::NextLeafIndex).unwrap_or(0);
        let frontier: Vec<U256> = s
            .get(&DataKey::Frontier)
            .unwrap_or_else(|| empty_frontier(env));
        let (new_root, new_frontier) = insert_leaf(env, commitment, index, &frontier);
        s.set(&DataKey::Frontier, &new_frontier);

        let mut history: Vec<U256> = s
            .get(&DataKey::RootHistory)
            .unwrap_or_else(|| Vec::new(env));
        history.push_back(new_root.clone());
        if history.len() > ROOT_HISTORY_SIZE {
            history.remove(0);
        }
        s.set(&DataKey::RootHistory, &history);
        s.set(&DataKey::CurrentRoot, &new_root);
        s.set(&DataKey::NextLeafIndex, &(index + 1));
        index
    }

    /// keccak256(XDR(ext)) reduced into the field. Client computes the same and
    /// the circuit carries it as a public input.
    fn hash_ext_data(env: &Env, ext: &ExtData) -> U256 {
        let payload = ext.clone().to_xdr(env);
        let digest: BytesN<32> = env.crypto().keccak256(&payload).into();
        U256::from_be_bytes(env, &Bytes::from(digest)).rem_euclid(&bn256_modulus(env))
    }

    /// publicAmount = signed as a field element; negatives wrap to p - |signed|.
    fn calc_public_amount(env: &Env, signed: i128) -> U256 {
        if signed >= 0 {
            let mut buf = [0u8; 32];
            buf[16..].copy_from_slice(&(signed as u128).to_be_bytes());
            U256::from_be_bytes(env, &Bytes::from_array(env, &buf))
        } else {
            let mut buf = [0u8; 32];
            buf[16..].copy_from_slice(&signed.unsigned_abs().to_be_bytes());
            let abs = U256::from_be_bytes(env, &Bytes::from_array(env, &buf));
            bn256_modulus(env).sub(&abs)
        }
    }

    /// Public inputs in the circuit's declared order:
    /// root, publicAmount, extDataHash, domain, inputNullifier[2], outputCommitment[2].
    fn public_inputs(
        env: &Env,
        proof: &TxProof,
        domain: &U256,
    ) -> Vec<soroban_sdk::crypto::bn254::Bn254Fr> {
        use soroban_sdk::crypto::bn254::Bn254Fr;
        let to_fr = |x: &U256| -> Bn254Fr {
            let b = x.to_be_bytes();
            let len = b.len();
            let mut buf = [0u8; 32];
            for i in 0..len {
                buf[(32 - len + i) as usize] = b.get(i).unwrap();
            }
            Bn254Fr::from_bytes(BytesN::from_array(env, &buf))
        };
        let mut v: Vec<Bn254Fr> = Vec::new(env);
        v.push_back(to_fr(&proof.root));
        v.push_back(to_fr(&proof.public_amount));
        v.push_back(to_fr(&proof.ext_data_hash));
        v.push_back(to_fr(domain));
        for n in proof.input_nullifiers.iter() {
            v.push_back(to_fr(&n));
        }
        for c in proof.output_commitments.iter() {
            v.push_back(to_fr(&c));
        }
        v
    }
}

#[cfg(test)]
mod test;
