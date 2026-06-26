pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";

// GrowthipMerkleNoteV3
//
// V3 change vs V2:
//   commitment = Poseidon(secret, nullifier, recipientHash)
//
// V3.1 change (deposit-amount-aware claims fix):
//   Added `index` as a new public output, derived from the binary
//   pathIndices[] bits that already existed as private inputs. This
//   lets the pool contract look up DataKey::CommitmentAmount(index) to
//   transfer the ACTUAL deposited amount on claim, instead of a flat
//   base unit -- fixing a bug where claiming a 5x/10x/20x deposit only
//   ever paid out 1x, permanently locking the remainder in the pool.
//
//   This does not weaken privacy: `index` is just the deposit's
//   position in the Merkle tree (already public via the commitment
//   list itself, which anyone can read on-chain), not the depositor's
//   identity or the secret/nullifier.
//
// Public inputs  : root, nullifierHash, recipientHashOut, index
// Private inputs : secret, nullifier, pathElements, pathIndices, recipientHash
template GrowthipMerkleNoteV3(DEPTH) {
    // --- Private inputs ---
    signal input secret;
    signal input nullifier;
    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];
    signal input recipientHash;   // moved to private: now bound inside commitment

    // --- Public outputs ---
    signal output root;
    signal output nullifierHash;
    signal output recipientHashOut;
    signal output index;          // NEW: leaf position, derived from pathIndices bits

    // --- Commitment: now includes recipientHash ---
    // commitment = Poseidon(secret, nullifier, recipientHash)
    component commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== nullifier;
    commitmentHasher.inputs[2] <== recipientHash;   // V3: bound here

    // --- NullifierHash ---
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash <== nullifierHasher.out;

    // --- RecipientHash pass-through as public output ---
    // Still exposed as public so pool contract can check it on-chain.
    // Security comes from the commitment binding above, not only the contract check.
    recipientHashOut <== recipientHash;

    // --- Merkle membership proof ---
    signal current[DEPTH + 1];
    current[0] <== commitmentHasher.out;

    component levelHasher[DEPTH];
    signal left[DEPTH];
    signal right[DEPTH];

    // Running powers-of-two accumulator to derive `index` from the
    // binary pathIndices bits. pathIndices[0] is the bit closest to the
    // leaf (least significant), matching getMerklePathByIndex() in
    // merkle.ts, which pushes bits bottom-up starting from leafIndex's
    // own parity at level 0.
    signal indexAcc[DEPTH + 1];
    indexAcc[0] <== 0;

    for (var i = 0; i < DEPTH; i++) {
        // pathIndices must be binary
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        left[i]  <== current[i] + pathIndices[i] * (pathElements[i] - current[i]);
        right[i] <== pathElements[i] + pathIndices[i] * (current[i] - pathElements[i]);

        levelHasher[i] = Poseidon(2);
        levelHasher[i].inputs[0] <== left[i];
        levelHasher[i].inputs[1] <== right[i];
        current[i + 1] <== levelHasher[i].out;

        indexAcc[i + 1] <== indexAcc[i] + pathIndices[i] * (2 ** i);
    }

    root <== current[DEPTH];
    index <== indexAcc[DEPTH];
}

component main = GrowthipMerkleNoteV3(20);
