use std::fs::{File, OpenOptions};
use std::io;
use std::os::windows::fs::OpenOptionsExt;
use std::path::Path;

// Windows rejects write access to a mapped executable. A held handle
// prevents the image from being launched during registry changes.
// FILE_SHARE_READ permits hashing. FILE_SHARE_DELETE permits our rename.
pub(crate) fn lock_program(path: &Path) -> io::Result<File> {
    OpenOptions::new().write(true).share_mode(1 | 4).open(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        env, fs,
        process::{Command, Stdio},
    };

    #[test]
    fn only_the_target_image_blocks_retirement() {
        let dir = env::temp_dir().join(format!("caiyun-legacy-lock-{}", std::process::id()));
        fs::create_dir_all(dir.join("legacy")).unwrap();
        let image = dir.join("app.exe");
        let legacy = dir.join("legacy/app.exe");
        fs::copy(
            Path::new(&env::var_os("SystemRoot").unwrap()).join("System32/ping.exe"),
            &image,
        )
        .unwrap();
        fs::copy(&image, &legacy).unwrap();
        let mut other = Command::new(&image)
            .args(["-t", "127.0.0.1"])
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        let result = (lock_program(&image), lock_program(&legacy));
        other.kill().unwrap();
        other.wait().unwrap();
        assert!(result.0.is_err());
        drop(result.1.unwrap());
        fs::rename(dir.join("legacy"), dir.join("archive")).unwrap();
        let moved = dir.join("archive/app.exe");
        let guard = lock_program(&moved).unwrap();
        assert!(Command::new(&moved).arg("-?").output().is_err());
        drop(guard);
        fs::remove_dir_all(dir).unwrap();
    }
}
