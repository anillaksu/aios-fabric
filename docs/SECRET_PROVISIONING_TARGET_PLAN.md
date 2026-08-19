# AIOS Secret Provisioning — Target Plan

Status labels: **FACT** means current code and runtime evidence; **TEST-VERIFIED** means checked in code/tests but not yet operated on the physical target; **TARGET** means no current implementation.

## Current fact: Android / Termux

**FACT (code + live canonical-store inspection + gateway probe):** Hermes gateway on port 8642 rejects both missing and invalid Bearer credentials. Its API server key is canonically stored as `gateway.platforms.api_server.extra.key` and is managed through the Hermes `config get/set` CLI inside the Ubuntu proot. Fabric reads `FABRIC_GATEWAY_KEY` only from its process environment.

**TEST-VERIFIED:** `scripts/provision-fabric-gateway-key.sh` is the Termux:Widget provisioning command. It does not print the secret. It atomically maintains:

```text
Hermes proot: `gateway.platforms.api_server.extra.key` via `hermes config set`
Termux:       ~/.config/aios/fabric.env  FABRIC_GATEWAY_KEY
```

It synchronizes one existing valid value, creates a new 256-bit hex value only when neither exists, and refuses a mismatch without changing either file. `start_hermes_os.sh`, `10-aios.sh`, and `watchdog.sh` source the Termux Fabric environment before starting Fabric. The deploy script installs the widget at `~/.shortcuts/provision-fabric-gateway-key.sh`.

Physical acceptance remains required: deploy, tap the widget once, then verify service health and an authenticated non-capability A2A request. Secret values must not be placed in journal, UI, source control, or logs.

## Cross-platform target contract

The portable contract is a *role*, not a copied file path:

```text
Gateway API_SERVER_KEY == Fabric FABRIC_GATEWAY_KEY
```

The provisioning action must be local-operator initiated, idempotent, no-secret-output, atomic across the two stores, and must restart only the processes that consume it. A mismatch must fail closed. PWA, MCP, A2A, LLM, and artifacts are never secret provisioning authorities.

| Target | Existing status | Future implementation gate |
|---|---|---|
| Android / Termux | TEST-VERIFIED script; live widget pending | Termux:Widget + proot `.env` + Termux 0600 env file |
| Linux host | TARGET | user-scoped `systemd` `EnvironmentFile=` plus gateway secret store; a local CLI action, not a web endpoint |
| Windows host | TARGET | DPAPI/Credential Manager-backed provisioning plus Task Scheduler/service environment; do not write a plaintext repository `.env` |
| macOS host | TARGET | Keychain-backed provisioning plus `launchd` environment; local app/CLI action |
| Cloudflare / Worker | TARGET | Worker secret binding and a separate service-to-service credential rotation path; never reuse a mobile device secret by default |
| Browser PWA / iOS | TARGET as a secret holder | no provisioning capability: browser UI can display non-secret health only; secret ownership stays on its paired trusted runtime |

## Action order for a new real target

1. Prove where the gateway authenticates and where its key is read.
2. Prove the service manager’s private environment mechanism.
3. Implement one local operator action that synchronizes/generates without displaying the value.
4. Add syntax/unit checks, then deploy to that target.
5. Prove unauthenticated request rejection and authenticated gateway/A2A success.
6. Only then record the target as FACT and expose non-secret health in AIOS.
