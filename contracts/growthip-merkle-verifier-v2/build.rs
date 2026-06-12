use std::{env, fs, path::PathBuf, str::FromStr};

use ark_bn254::{Fq, Fq2, G1Affine, G2Affine};
use ark_ec::AffineRepr;
use ark_ff::{BigInteger, PrimeField};
use serde::Deserialize;

#[derive(Deserialize)]
struct Parameters {
    public_inputs_len: usize,
    verification_key: VerificationKeyJson,
}

#[derive(Deserialize)]
struct VerificationKeyJson {
    alpha: PointG1Json,
    beta: PointG2Json,
    gamma: PointG2Json,
    delta: PointG2Json,
    #[serde(rename = "IC")]
    ic: Vec<PointG1Json>,
}

#[derive(Deserialize)]
struct PointG1Json {
    x: String,
    y: String,
}

impl PointG1Json {
    fn to_g1_affine(&self) -> G1Affine {
        let x = Fq::from_str(&self.x).expect("invalid G1 x");
        let y = Fq::from_str(&self.y).expect("invalid G1 y");
        let point = G1Affine::new(x, y);
        assert!(point.is_on_curve());
        point
    }
}

#[derive(Deserialize)]
struct PointG2Json {
    x1: String,
    x2: String,
    y1: String,
    y2: String,
}

impl PointG2Json {
    fn to_g2_affine(&self) -> G2Affine {
        let x_im = Fq::from_str(&self.x1).expect("invalid G2 x1");
        let x_re = Fq::from_str(&self.x2).expect("invalid G2 x2");
        let y_im = Fq::from_str(&self.y1).expect("invalid G2 y1");
        let y_re = Fq::from_str(&self.y2).expect("invalid G2 y2");

        let x = Fq2::new(x_re, x_im);
        let y = Fq2::new(y_re, y_im);

        let point = G2Affine::new(x, y);
        assert!(point.is_on_curve());
        point
    }
}

fn fq_to_be_32(f: &Fq) -> [u8; 32] {
    let raw = f.into_bigint().to_bytes_be();
    assert!(raw.len() <= 32);

    let mut out = [0u8; 32];
    out[32 - raw.len()..].copy_from_slice(&raw);
    out
}

fn format_byte_array(bytes: &[u8]) -> String {
    let formatted: Vec<String> = bytes.iter().map(|b| format!("{:#04x}", b)).collect();
    format!("[{}]", formatted.join(", "))
}

fn serialize_g1_point(p: &G1Affine) -> [u8; 64] {
    let mut buf = [0u8; 64];
    let (x, y) = p.xy().unwrap();

    let x_bytes = fq_to_be_32(&x);
    let y_bytes = fq_to_be_32(&y);

    buf[0..32].copy_from_slice(&x_bytes);
    buf[32..64].copy_from_slice(&y_bytes);

    buf
}

fn serialize_g2_point(p: &G2Affine) -> [u8; 128] {
    let mut buf = [0u8; 128];
    let (x, y) = p.xy().unwrap();

    let x_im = fq_to_be_32(&x.c1);
    let x_re = fq_to_be_32(&x.c0);
    let y_im = fq_to_be_32(&y.c1);
    let y_re = fq_to_be_32(&y.c0);

    buf[0..32].copy_from_slice(&x_im);
    buf[32..64].copy_from_slice(&x_re);
    buf[64..96].copy_from_slice(&y_im);
    buf[96..128].copy_from_slice(&y_re);

    buf
}

fn main() {
    let data = fs::read_to_string("parameters.json").expect("missing parameters.json");
    let params: Parameters = serde_json::from_str(&data).expect("invalid parameters.json");

    assert_eq!(
        params.verification_key.ic.len(),
        params.public_inputs_len + 1,
        "IC length must be public_inputs_len + 1"
    );

    let alpha = params.verification_key.alpha.to_g1_affine();
    let beta = params.verification_key.beta.to_g2_affine();
    let gamma = params.verification_key.gamma.to_g2_affine();
    let delta = params.verification_key.delta.to_g2_affine();

    let ic: Vec<[u8; 64]> = params
        .verification_key
        .ic
        .iter()
        .map(|p| serialize_g1_point(&p.to_g1_affine()))
        .collect();

    let ic_string = format!(
        "[{}]",
        ic.iter()
            .map(|p| format_byte_array(p))
            .collect::<Vec<_>>()
            .join(", ")
    );

    let vk_string = format!(
        "VerificationKeyBytes {{ alpha: {}, beta: {}, gamma: {}, delta: {}, ic: {} }}",
        format_byte_array(&serialize_g1_point(&alpha)),
        format_byte_array(&serialize_g2_point(&beta)),
        format_byte_array(&serialize_g2_point(&gamma)),
        format_byte_array(&serialize_g2_point(&delta)),
        ic_string
    );

    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());

    fs::write(out_dir.join("verification_key.rs"), vk_string).unwrap();
    fs::write(
        out_dir.join("public_inputs_len.rs"),
        format!("{}", params.public_inputs_len),
    )
    .unwrap();

    println!("cargo:rerun-if-changed=parameters.json");
}
