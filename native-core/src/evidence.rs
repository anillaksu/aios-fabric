//! Port of desktop/observer.mjs EvidenceLedger.verifyChain(). This is what the
//! Android Evidence Vault (L3) calls to verify its local cache against the same
//! algorithm the canonical (Windows) EvidenceLedger uses — the vault never
//! invents its own verification rule.

use crate::canonical::canonical_json;
use crate::hashing::sha256_hex;
use serde_json::{Map, Value};

#[derive(Debug, PartialEq)]
pub enum ChainVerifyStatus {
    EmptyLedger,
    ChainValid { events: usize, latest_hash: String },
    ChainBreak { at_line: usize, expected_prev: String, actual_prev: String },
    HashMismatch { at_line: usize, computed: String, recorded: String },
}

/// `entries` is the already-parsed JSONL, one Value::Object per line, in file order.
pub fn verify_chain(entries: &[Value]) -> ChainVerifyStatus {
    if entries.is_empty() {
        return ChainVerifyStatus::EmptyLedger;
    }

    let mut expected_prev = "GENESIS".to_string();
    for (i, item) in entries.iter().enumerate() {
        let obj = item.as_object().expect("evidence entry must be a JSON object");

        let actual_prev = obj
            .get("previous_witness_hash")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if actual_prev != expected_prev {
            return ChainVerifyStatus::ChainBreak {
                at_line: i + 1,
                expected_prev,
                actual_prev,
            };
        }

        let recorded_hash = obj
            .get("current_witness_hash")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        // payload = item minus current_witness_hash and metadata (matches the JS destructure)
        let mut payload = Map::new();
        for (k, v) in obj.iter() {
            if k != "current_witness_hash" && k != "metadata" {
                payload.insert(k.clone(), v.clone());
            }
        }
        let computed_hash = sha256_hex(canonical_json(&Value::Object(payload)).as_bytes());

        if computed_hash != recorded_hash {
            return ChainVerifyStatus::HashMismatch {
                at_line: i + 1,
                computed: computed_hash,
                recorded: recorded_hash,
            };
        }
        expected_prev = computed_hash;
    }

    ChainVerifyStatus::ChainValid {
        events: entries.len(),
        latest_hash: expected_prev,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn empty_ledger_is_ok() {
        assert_eq!(verify_chain(&[]), ChainVerifyStatus::EmptyLedger);
    }

    #[test]
    fn single_entry_chain_is_valid_when_hash_matches() {
        // payload excludes current_witness_hash/metadata, same as the JS destructure.
        let payload = json!({
            "timestamp_utc": "2026-08-21T00:00:00.000Z",
            "observation_id": "obs-test",
            "previous_witness_hash": "GENESIS",
            "operation": "test.op",
            "success": true
        });
        let hash = sha256_hex(canonical_json(&payload).as_bytes());
        let mut entry = payload.as_object().unwrap().clone();
        entry.insert("current_witness_hash".to_string(), json!(hash));
        let entries = vec![Value::Object(entry)];

        match verify_chain(&entries) {
            ChainVerifyStatus::ChainValid { events, latest_hash } => {
                assert_eq!(events, 1);
                assert_eq!(latest_hash, hash);
            }
            other => panic!("expected ChainValid, got {:?}", other),
        }
    }

    #[test]
    fn tampered_payload_is_detected_as_hash_mismatch() {
        let mut entry = Map::new();
        entry.insert("previous_witness_hash".to_string(), json!("GENESIS"));
        entry.insert("operation".to_string(), json!("test.op"));
        entry.insert("current_witness_hash".to_string(), json!("not-the-real-hash"));
        let entries = vec![Value::Object(entry)];

        match verify_chain(&entries) {
            ChainVerifyStatus::HashMismatch { at_line, .. } => assert_eq!(at_line, 1),
            other => panic!("expected HashMismatch, got {:?}", other),
        }
    }
}
