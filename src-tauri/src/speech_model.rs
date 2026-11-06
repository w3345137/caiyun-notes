//! Offline model data contract, shared by the native host and its CPU-runtime tests.
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, io::Read, path::Path};

#[derive(Deserialize)]
pub struct Model {
    pub base: String,
    pub files: Vec<ModelFile>,
}

#[derive(Deserialize)]
pub struct ModelFile {
    pub name: String,
    pub bytes: u64,
    pub sha256: String,
}

pub fn catalog(mlx: bool) -> BTreeMap<String, Model> {
    serde_json::from_str(if mlx {
        include_str!("qwen-models.json")
    } else {
        include_str!("qwen-cpu-models.json")
    })
    .expect("embedded speech model catalog")
}

pub fn has_files(directory: &Path, model: &Model) -> bool {
    model.files.iter().all(|file| {
        std::fs::metadata(directory.join(&file.name))
            .is_ok_and(|metadata| metadata.is_file() && metadata.len() == file.bytes)
    })
}

/// Validate data in its final fixed directory. Never copy or move user downloads.
/// A failed check revokes readiness; no model code or pickle files are executed.
pub fn verify_directory(directory: &Path, model: &Model) -> Result<(), String> {
    let receipt = directory.join(".caiyun-model-revision");
    if receipt.exists() {
        std::fs::remove_file(&receipt).map_err(|_| "QWEN_STORAGE")?;
    }
    if !has_files(directory, model) {
        return Err("QWEN_MODEL_FORMAT".into());
    }
    let mut buffer = vec![0u8; 1024 * 1024];
    for file in &model.files {
        let mut input =
            std::fs::File::open(directory.join(&file.name)).map_err(|_| "QWEN_STORAGE")?;
        let mut hash = Sha256::new();
        let mut count = 0u64;
        loop {
            let n = input.read(&mut buffer).map_err(|_| "QWEN_STORAGE")?;
            if n == 0 {
                break;
            }
            count += n as u64;
            if count > file.bytes {
                return Err("QWEN_INTEGRITY".into());
            }
            hash.update(&buffer[..n]);
        }
        if count != file.bytes || hex::encode(hash.finalize()) != file.sha256 {
            return Err("QWEN_INTEGRITY".into());
        }
    }
    // Only the small derived tokenizer and verification receipt are generated.
    write_tokenizer(directory)?;
    std::fs::write(receipt, &model.base).map_err(|_| "QWEN_STORAGE")?;
    Ok(())
}

pub fn installed(directory: &Path, model: &Model) -> bool {
    has_files(directory, model)
        && directory.join("tokenizer.json").is_file()
        && std::fs::read_to_string(directory.join(".caiyun-model-revision"))
            .is_ok_and(|revision| revision == model.base)
}

pub fn write_tokenizer(directory: &Path) -> Result<(), String> {
    use serde_json::{json, Value};
    let read = |name: &str| {
        std::fs::read_to_string(directory.join(name)).map_err(|_| "QWEN_STORAGE".to_string())
    };
    let vocab: Value =
        serde_json::from_str(&read("vocab.json")?).map_err(|_| "QWEN_MODEL_FORMAT")?;
    let config: Value =
        serde_json::from_str(&read("tokenizer_config.json")?).map_err(|_| "QWEN_MODEL_FORMAT")?;
    let merges_text = read("merges.txt")?;
    let merges: Vec<_> = merges_text
        .lines()
        .filter(|line| !line.starts_with('#') && !line.is_empty())
        .collect();
    let decoder = config["added_tokens_decoder"]
        .as_object()
        .ok_or("QWEN_MODEL_FORMAT")?;
    let mut added_tokens: Vec<_> = decoder
        .iter()
        .map(|(id, token)| Ok((id.parse::<u64>().map_err(|_| "QWEN_MODEL_FORMAT")?, token)))
        .collect::<Result<_, &str>>()?;
    added_tokens.sort_by_key(|(id, _)| *id);
    let added_tokens: Vec<_> = added_tokens
        .iter()
        .map(|(id, token)| {
            json!({
                "id": id, "content": token["content"], "single_word": false,
                "lstrip": false, "rstrip": false, "normalized": false, "special": token["special"]
            })
        })
        .collect();
    let byte_level =
        json!({"type":"ByteLevel","add_prefix_space":false,"trim_offsets":false,"use_regex":false});
    // Qwen2Tokenizer's split expression, matching the pinned upstream runtime's reconstruction.
    let split = json!({"type":"Split","pattern":{"Regex":r"(?i:'s|'t|'re|'ve|'m|'ll|'d)|[^\r\n\p{L}\p{N}]?\p{L}+|\p{N}| ?[^\s\p{L}\p{N}]+[\r\n]*|\s*[\r\n]+|\s+(?!\S)|\s+"},"behavior":"Isolated","invert":false});
    let tokenizer = json!({
        "version":"1.0", "truncation":null, "padding":null, "added_tokens":added_tokens,
        "normalizer":{"type":"NFC"},
        "pre_tokenizer":{"type":"Sequence","pretokenizers":[split,byte_level.clone()]},
        "post_processor":byte_level.clone(), "decoder":byte_level,
        "model":{"type":"BPE","dropout":null,"unk_token":null,"continuing_subword_prefix":"",
            "end_of_word_suffix":"","fuse_unk":false,"byte_fallback":false,"ignore_merges":false,
            "vocab":vocab,"merges":merges}
    });
    std::fs::write(
        directory.join("tokenizer.json"),
        serde_json::to_vec(&tokenizer).map_err(|_| "QWEN_MODEL_FORMAT")?,
    )
    .map_err(|_| "QWEN_STORAGE".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalogs_cover_both_models_with_distinct_formats_and_complete_shards() {
        for mlx in [false, true] {
            let models = catalog(mlx);
            assert_eq!(models.len(), 2);
            for id in ["0.6B", "1.7B"] {
                let model = &models[id];
                assert!(model.base.starts_with("https://huggingface.co/"));
                assert!(model.files.iter().all(|f| !f.name.contains('/')
                    && !f.name.contains('\\')
                    && f.sha256.len() == 64));
                assert!(model.files.iter().any(|f| f.name.ends_with(".safetensors")));
            }
            assert_eq!(
                models["1.7B"]
                    .files
                    .iter()
                    .filter(|f| f.name.ends_with(".safetensors"))
                    .count(),
                if mlx { 1 } else { 2 }
            );
        }
    }

    #[test]
    fn rejects_incomplete_and_same_size_corrupted_downloads() {
        let source = tempfile::tempdir().unwrap();

        let file = ModelFile {
            name: "model.safetensors".into(),
            bytes: 4,
            sha256: hex::encode(Sha256::digest(b"good")),
        };
        let model = Model {
            base: "pinned-revision".into(),
            files: vec![file],
        };
        assert_eq!(
            verify_directory(source.path(), &model).unwrap_err(),
            "QWEN_MODEL_FORMAT"
        );
        std::fs::write(source.path().join("model.safetensors"), b"evil").unwrap();
        assert_eq!(
            verify_directory(source.path(), &model).unwrap_err(),
            "QWEN_INTEGRITY"
        );
        assert!(!installed(source.path(), &model));
        assert_eq!(
            std::fs::read(source.path().join("model.safetensors")).unwrap(),
            b"evil"
        );
    }

    #[test]
    fn verifies_in_place_and_revokes_readiness_after_corruption() {
        let directory = tempfile::tempdir().unwrap();
        let mut model = Model {
            base: "pinned-model-revision".into(),
            files: vec![],
        };
        for (name, data) in [
            ("model-00001-of-00002.safetensors", "weight shard one"),
            ("model-00002-of-00002.safetensors", "weight shard two"),
            ("vocab.json", r#"{"a":0}"#),
            ("merges.txt", "#version: 0.2\n"),
            (
                "tokenizer_config.json",
                r#"{"added_tokens_decoder":{"1":{"content":"<|endoftext|>","special":true}}}"#,
            ),
        ] {
            std::fs::write(directory.path().join(name), data).unwrap();
            model.files.push(ModelFile {
                name: name.into(),
                bytes: data.len() as u64,
                sha256: hex::encode(Sha256::digest(data.as_bytes())),
            });
        }
        verify_directory(directory.path(), &model).unwrap();
        assert!(installed(directory.path(), &model));
        assert_eq!(
            std::fs::read_dir(directory.path()).unwrap().count(),
            model.files.len() + 2,
            "only tokenizer and receipt may be generated"
        );
        let shard = directory.path().join("model-00002-of-00002.safetensors");
        assert_eq!(std::fs::read_to_string(&shard).unwrap(), "weight shard two");
        std::fs::write(&shard, "weight shard BAD").unwrap();
        assert_eq!(
            verify_directory(directory.path(), &model).unwrap_err(),
            "QWEN_INTEGRITY"
        );
        assert!(!installed(directory.path(), &model));
        assert_eq!(
            std::fs::read_to_string(&shard).unwrap(),
            "weight shard BAD",
            "verification must leave downloads intact"
        );
    }
}
