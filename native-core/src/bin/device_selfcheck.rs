//! Standalone executable proof: runs the same golden-vector checks as `cargo test`
//! but as a real ELF binary pushed to and executed on a physical Android device via
//! `adb shell`. This is the Part 22/Part 23 "RUN" + "OBSERVE" proof for AIOS Core
//! Native (L0) — not a unit test on a host CI runner, an actual process on the
//! actual arm64 CPU of the actual admitted node.

use aios_core_native::{calculate_node_identity, canonical_json, sha256_hex, verify_chain, NodeMetadata};
use serde_json::{json, Value};

fn check(name: &str, ok: bool, detail: &str) -> bool {
    println!("{} {} — {}", if ok { "PASS" } else { "FAIL" }, name, detail);
    ok
}

fn main() {
    println!("=== AIOS CORE NATIVE — ON-DEVICE SELF-CHECK ===");
    let mut all_ok = true;

    // 1. canonical_json + sha256 golden vector (same as canonical.rs test, empty_object case)
    let canon = canonical_json(&json!({}));
    let hash = sha256_hex(canon.as_bytes());
    all_ok &= check(
        "canonical_json+sha256(empty_object)",
        canon == "{}" && hash == "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        &format!("canon={} hash={}", canon, hash),
    );

    // 2. node identity golden vector
    let meta = NodeMetadata {
        agent_name: "test-agent".to_string(),
        agent_version: "1.0.0".to_string(),
        arch: "arm64".to_string(),
        endpoint: "http://127.0.0.1:9300".to_string(),
        platform: "android".to_string(),
    };
    let id = calculate_node_identity(&meta);
    all_ok &= check(
        "calculate_node_identity",
        id == "node-e063da3fd0d8a02f3bcc981f02eb8a51b83800b15f90abb079cd82695d8c3331",
        &id,
    );

    // 3. evidence chain verification, single valid entry
    let payload = json!({
        "timestamp_utc": "2026-08-21T00:00:00.000Z",
        "observation_id": "obs-device-selfcheck",
        "previous_witness_hash": "GENESIS",
        "operation": "device.selfcheck",
        "success": true
    });
    let entry_hash = sha256_hex(canonical_json(&payload).as_bytes());
    let mut entry = payload.as_object().unwrap().clone();
    entry.insert("current_witness_hash".to_string(), json!(entry_hash));
    let result = verify_chain(&[Value::Object(entry)]);
    let chain_ok = matches!(result, aios_core_native::ChainVerifyStatus::ChainValid { events: 1, .. });
    all_ok &= check("verify_chain(single valid entry)", chain_ok, &format!("{:?}", result));

    println!("=== {} ===", if all_ok { "ALL CHECKS PASSED ON DEVICE" } else { "CHECKS FAILED" });
    std::process::exit(if all_ok { 0 } else { 1 });
}
