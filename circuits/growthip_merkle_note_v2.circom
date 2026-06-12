pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";

template GrowthipMerkleNoteV2(DEPTH) {
    signal input secret;
    signal input nullifier;

    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];

    // Public recipient binding.
    // In MVP this is a field representation/hash registered by the creator.
    signal input recipientHash;

    signal output root;
    signal output nullifierHash;
    signal output recipientHashOut;

    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== nullifier;

    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash <== nullifierHasher.out;

    recipientHashOut <== recipientHash;

    signal current[DEPTH + 1];
    current[0] <== commitmentHasher.out;

    component levelHasher[DEPTH];

    signal left[DEPTH];
    signal right[DEPTH];

    for (var i = 0; i < DEPTH; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        left[i] <== current[i] + pathIndices[i] * (pathElements[i] - current[i]);
        right[i] <== pathElements[i] + pathIndices[i] * (current[i] - pathElements[i]);

        levelHasher[i] = Poseidon(2);
        levelHasher[i].inputs[0] <== left[i];
        levelHasher[i].inputs[1] <== right[i];

        current[i + 1] <== levelHasher[i].out;
    }

    root <== current[DEPTH];
}

component main = GrowthipMerkleNoteV2(3);
