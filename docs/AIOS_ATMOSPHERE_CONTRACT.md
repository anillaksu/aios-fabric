# AIOS Atmosphere and Interaction Contract

Status: **TEST-VERIFIED** for source and contract checks; phone visual acceptance remains required.

AIOS has one interaction language across PWA shell, artifact surfaces, and Termux operator consoles. Atmosphere may enrich orientation, but cannot replace status, text contrast, focus, or evidence.

## Shared rules

- **Dark operational surfaces:** Phosphor, Amber, Ice, Synth, and Night City use shared atmosphere tokens: skyline glow, sparse grid, and scanline depth. Components still use semantic surface/text/border tokens.
- **Night City:** a user-selected dark theme (`NCT`), not a per-screen surprise. It is cyan/pink neon over a dark city field.
- **Paper:** daylight/readability mode; it deliberately disables heavy glow and atmospheric gradients.
- **Motion:** native View Transition API when supported; fast/base/slow tokens; `prefers-reduced-motion` removes decorative animation and atmospheric scanlines.
- **Interaction:** visible focus, 44px touch targets, deterministic loading/ready/empty/error states, no clipped critical text, and no false progress.
- **Terminal/widget:** ASCII framing and emoji labels may orient the operator. Each `OK`, `SINIRLI`, or `HATA` is emitted only after a process or HTTP check.

## Boundaries

No external image, animation, icon, router, or UI framework is introduced. Themes do not affect dispatcher/policy, capability semantics, approval, or journal evidence. A visual change becomes FACT only after build/test plus physical-device acceptance.
