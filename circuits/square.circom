pragma circom 2.1.6;

template Square() {
    signal input x;
    signal input y;

    x * x === y;
}

component main { public [y] } = Square();
