//! Mirrors desktop/runtime-console.mjs ALLOWED_STATES. The native core does not
//! introduce a 9th state — if the canonical set grows, this enum grows to match,
//! never independently (see docs/android-foundation/03-NATIVE-CORE-BOUNDARY.md).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskState {
    Queued,
    Running,
    Blocked,
    Failed,
    Passed,
    Stale,
    Cancelled,
    WaitingHuman,
}

pub const ALLOWED_STATES: [TaskState; 8] = [
    TaskState::Queued,
    TaskState::Running,
    TaskState::Blocked,
    TaskState::Failed,
    TaskState::Passed,
    TaskState::Stale,
    TaskState::Cancelled,
    TaskState::WaitingHuman,
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowed_states_has_exactly_eight_canonical_states() {
        // Regression guard mirroring desktop/test-adaptive-surface.mjs test 56 —
        // any drift between the JS and Rust state vocabularies must fail loudly.
        assert_eq!(ALLOWED_STATES.len(), 8);
    }
}
