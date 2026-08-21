//! Port of desktop/attestation.mjs calculateNodeIdentity(). Deterministic node
//! identity, not device-level attestation (see docs/android-foundation/06-SECURITY-BOUNDARY.md
//! — DeviceAttestationProvider is a separate, honestly-NOT_IMPLEMENTED concern).

use crate::canonical::canonical_json;
use crate::hashing::sha256_hex;
use serde_json::json;

pub struct NodeMetadata {
    pub agent_name: String,
    pub agent_version: String,
    pub arch: String,
    pub endpoint: String,
    pub platform: String,
}

/// Mirrors: "node-" + sha256(canonicalJson({ agent_name, agent_version, arch,
/// endpoint: endpoint.replace(/\/$/, ""), platform }))
pub fn calculate_node_identity(metadata: &NodeMetadata) -> String {
    let endpoint = metadata.endpoint.trim_end_matches('/');
    let payload = json!({
        "agent_name": metadata.agent_name,
        "agent_version": metadata.agent_version,
        "arch": metadata.arch,
        "endpoint": endpoint,
        "platform": metadata.platform,
    });
    format!("node-{}", sha256_hex(canonical_json(&payload).as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_node_identity_golden_vector() {
        // Same payload as canonical.rs's "node_identity_payload" vector, whose
        // canonical form and sha256 were generated from desktop/attestation.mjs's
        // own dependency (observer.mjs canonicalJson/sha256) on 2026-08-21.
        let meta = NodeMetadata {
            agent_name: "test-agent".to_string(),
            agent_version: "1.0.0".to_string(),
            arch: "arm64".to_string(),
            endpoint: "http://127.0.0.1:9300".to_string(),
            platform: "android".to_string(),
        };
        let id = calculate_node_identity(&meta);
        assert_eq!(
            id,
            "node-e063da3fd0d8a02f3bcc981f02eb8a51b83800b15f90abb079cd82695d8c3331"
        );
    }

    #[test]
    fn trailing_slash_on_endpoint_is_stripped_like_js() {
        let meta = NodeMetadata {
            agent_name: "test-agent".to_string(),
            agent_version: "1.0.0".to_string(),
            arch: "arm64".to_string(),
            endpoint: "http://127.0.0.1:9300/".to_string(),
            platform: "android".to_string(),
        };
        let id = calculate_node_identity(&meta);
        assert_eq!(
            id,
            "node-e063da3fd0d8a02f3bcc981f02eb8a51b83800b15f90abb079cd82695d8c3331"
        );
    }
}
