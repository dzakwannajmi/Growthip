pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";

template GrowthipMerkleNote(DEPTH) {
    signal input secret;
    signal input nullifier;

    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];

    signal output root;
    signal output nullifierHash;

    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== nullifier;

    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash <== nullifierHasher.out;

    signal current[DEPTH + 1];
    current[0] <== commitmentHasher.out;

    component levelHasher[DEPTH];

    signal left[DEPTH];
    signal right[DEPTH];

    for (var i = 0; i < DEPTH; i++) {
        // pathIndices must be 0 or 1
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        // if pathIndices[i] == 0:
        //   left = current, right = sibling
        // if pathIndices[i] == 1:
        //   left = sibling, right = current
        left[i] <== current[i] + pathIndices[i] * (pathElements[i] - current[i]);
        right[i] <== pathElements[i] + pathIndices[i] * (current[i] - pathElements[i]);

        levelHasher[i] = Poseidon(2);
        levelHasher[i].inputs[0] <== left[i];
        levelHasher[i].inputs[1] <== right[i];

        current[i + 1] <== levelHasher[i].out;
    }

    root <== current[DEPTH];
}

// DEPTH 3 = 8 leaves. Good enough for first demo.
component main = GrowthipMerkleNote(3);
