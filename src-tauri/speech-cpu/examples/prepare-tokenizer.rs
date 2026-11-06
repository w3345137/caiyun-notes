// Development fixture helper; release clients generate this during in-place verification.
#[path = "../../src/speech_model.rs"]
#[allow(dead_code)]
#[allow(dead_code)]
mod speech_model;

fn main() {
    let directory = std::env::args_os().nth(1).expect("fixture directory");
    speech_model::write_tokenizer(std::path::Path::new(&directory)).expect("prepare fixture tokenizer");
}
