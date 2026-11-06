// Developer acceptance helper, using the exact client validation without copying model data.
#[path = "../../src/speech_model.rs"]
#[allow(dead_code)]
mod speech_model;

fn main() {
    let mut args = std::env::args().skip(1);
    let engine = args.next().expect("mlx or cpu");
    let size = args.next().expect("0.6B or 1.7B");
    let directory = args.next().expect("model directory");
    let model = speech_model::catalog(engine == "mlx")
        .remove(&size)
        .expect("model");
    speech_model::verify_directory(std::path::Path::new(&directory), &model)
        .expect("model verification");
    assert!(speech_model::installed(
        std::path::Path::new(&directory),
        &model
    ));
    println!("Verified {engine} {size}; no model files copied");
}
