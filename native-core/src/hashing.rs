use sha2::{Digest, Sha256};

/// Matches desktop/observer.mjs sha256(): createHash("sha256").update(text).digest("hex")
pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}
