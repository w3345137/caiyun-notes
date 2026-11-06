//! Packaged offline CPU runtime. No Python, downloads, user code, or GPU driver is required.
use qwen3_asr::{AsrInference, TranscribeOptions};
use std::path::Path;

#[cfg(test)]
#[path = "../../src/speech_model.rs"]
mod speech_model;

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args_os().collect();
    if args.len() == 2 && args[1] == "--version" {
        println!("CaiyunQwenCpu 0.1.0 qwen3-asr=0.2.2 cpu");
        return Ok(());
    }
    if args.len() != 3 {
        return Err("Expected fixed model directory and WAV path".into());
    }
    // Both official 0.6B and 1.7B architectures are read from config.json.
    let engine = AsrInference::load(Path::new(&args[1]), qwen3_asr::best_device())?;
    let output = engine.transcribe(
        args[2].to_str().ok_or("Unsupported WAV path")?,
        TranscribeOptions::default().with_max_new_tokens(2048),
    )?;
    println!("{}", serde_json::json!({ "text": output.text }));
    Ok(())
}

fn main() {
    if run().is_err() {
        // Do not put local paths, speech, or model contents in production logs.
        eprintln!("Local CPU inference failed");
        std::process::exit(1);
    }
}
