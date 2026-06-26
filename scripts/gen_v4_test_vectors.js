const circomlibjs = require("circomlibjs");

async function main() {
  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;
  const hash2 = (a, b) => F.toString(poseidon([BigInt(a), BigInt(b)]));

  const DEPTH = 20;

  // Compute empty nodes
  const emptyNodes = ["0"];
  for (let i = 1; i <= DEPTH; i++) {
    emptyNodes.push(hash2(emptyNodes[i-1], emptyNodes[i-1]));
  }
  console.log("empty_root (depth-20):", emptyNodes[DEPTH]);

  // Insert ["111", "222", "333"] incrementally
  const commitments = ["111", "222", "333"];
  let frontier = emptyNodes.slice(0, DEPTH); // frontier[i] = empty node at level i

  let root = emptyNodes[DEPTH];
  for (let leafIdx = 0; leafIdx < commitments.length; leafIdx++) {
    let node = commitments[leafIdx];
    let idx = leafIdx;
    let newFrontier = [...frontier];
    for (let level = 0; level < DEPTH; level++) {
      if (idx % 2 === 1) {
        // right child: hash(frontier[level], node)
        node = hash2(frontier[level], node);
      } else {
        // left child: update frontier, hash(node, empty[level])
        newFrontier[level] = node;
        node = hash2(node, emptyNodes[level]);
      }
      idx = Math.floor(idx / 2);
    }
    frontier = newFrontier;
    root = node;
    console.log(`root after insert [${leafIdx}] = ${commitments[leafIdx]}:`, root);
  }
}
main().catch(console.error);
