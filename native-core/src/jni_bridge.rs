//! JNI boundary for the Android Node Agent (L2) to call into AIOS Core Native (L0).
//! Only compiled with `--features android-jni`. Package/class name here
//! (com.aios.nodeagent.NativeCore) must match android/app/src/main/java/... — see
//! docs/android-foundation/08-VERTICAL-SLICE-STATUS.md for the vertical-slice this
//! belongs to.

#![cfg(feature = "android-jni")]

use crate::canonical::canonical_json;
use crate::hashing::sha256_hex;
use crate::node_identity::{calculate_node_identity, NodeMetadata};
use jni::objects::{JClass, JString};
use jni::sys::jstring;
use jni::JNIEnv;
use serde_json::json;

/// Proves the JNI round-trip: canonicalizes `{}` and hashes it, using the exact
/// same code path as the host `cargo test` golden vectors and the on-device
/// `device_selfcheck` binary. If this doesn't match, the JNI boundary itself
/// (not the algorithm) is broken — e.g. wrong calling convention or ABI mismatch.
#[no_mangle]
pub extern "system" fn Java_com_aios_nodeagent_NativeCore_selfCheckHash<'local>(
    env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> jstring {
    let canon = canonical_json(&json!({}));
    let hash = sha256_hex(canon.as_bytes());
    let out = env
        .new_string(hash)
        .expect("failed to allocate JNI string");
    out.into_raw()
}

/// Computes the deterministic node identity for this device, from JVM-supplied
/// device diagnostics (Part 7 device.diagnostics.read) — the same algorithm as
/// desktop/attestation.mjs, run natively on-device instead of over HTTP.
#[no_mangle]
pub extern "system" fn Java_com_aios_nodeagent_NativeCore_computeNodeIdentity<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    agent_name: JString<'local>,
    agent_version: JString<'local>,
    arch: JString<'local>,
    endpoint: JString<'local>,
) -> jstring {
    let meta = NodeMetadata {
        agent_name: env
            .get_string(&agent_name)
            .expect("invalid agent_name")
            .into(),
        agent_version: env
            .get_string(&agent_version)
            .expect("invalid agent_version")
            .into(),
        arch: env.get_string(&arch).expect("invalid arch").into(),
        endpoint: env.get_string(&endpoint).expect("invalid endpoint").into(),
        platform: "android".to_string(),
    };
    let id = calculate_node_identity(&meta);
    let out = env.new_string(id).expect("failed to allocate JNI string");
    out.into_raw()
}
