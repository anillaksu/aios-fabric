//! AIOS Core Native (L0). Pure, side-effect-free functions only — no IO, no
//! network. See docs/android-foundation/03-NATIVE-CORE-BOUNDARY.md for the full
//! contract and honesty rules (this crate does not claim capabilities it hasn't
//! proven with a golden-vector test against the Node.js canonical implementation).
//!
//! FFI/JNI export (#[no_mangle] extern "C") is intentionally NOT wired up yet —
//! that requires a concrete Android package/JNI class name decided in Faz 3
//! (Android Runtime Service), which does not exist in this repository. Wiring an
//! FFI boundary with no caller would be an unproven claim; the pure Rust API
//! below is what Faz 3 will bind to.

pub mod canonical;
pub mod evidence;
pub mod hashing;
pub mod jni_bridge;
pub mod node_identity;
pub mod task_state;

pub use canonical::canonical_json;
pub use evidence::{verify_chain, ChainVerifyStatus};
pub use hashing::sha256_hex;
pub use node_identity::{calculate_node_identity, NodeMetadata};
pub use task_state::{TaskState, ALLOWED_STATES};

/// signature verification (Part 3 core_verify_signature) — NOT_IMPLEMENTED.
/// No signing scheme has been chosen yet (see docs/android-foundation/06-SECURITY-BOUNDARY.md
/// and 04-INSTALL-UPDATE-ROLLBACK.md). Returning a hardcoded false, not a stub
/// that silently "passes", so a caller can never mistake absence-of-implementation
/// for a verified signature.
pub fn verify_signature_not_implemented(_payload: &[u8], _signature: &[u8], _key_ref: &str) -> Result<bool, &'static str> {
    Err("NOT_IMPLEMENTED: no signing scheme selected yet")
}
