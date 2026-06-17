pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";

// GrowthipMerkleNoteV3
//
// V3 change vs V2:
//   commitment = Poseidon(secret, nullifier, recipientHash)
//
// This cryptographically binds the recipient into the commitment.
// A note generated for recipientHash_A cannot produce a valid proof
// for recipientHash_B, even if the prover knows secret and nullifier.
//
// Public inputs  : root, nullifierHash, recipientHashOut
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

    for (var i = 0; i < DEPTH; i++) {
        // pathIndices must be binary
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        left[i]  <== current[i] + pathIndices[i] * (pathElements[i] - current[i]);
        right[i] <== pathElements[i] + pathIndices[i] * (current[i] - pathElements[i]);

        levelHasher[i] = Poseidon(2);
        levelHasher[i].inputs[0] <== left[i];
        levelHasher[i].inputs[1] <== right[i];
        current[i + 1] <== levelHasher[i].out;
    }

    root <== current[DEPTH];
}

component main = GrowthipMerkleNoteV3(3);