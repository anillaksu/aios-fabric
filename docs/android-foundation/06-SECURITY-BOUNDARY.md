# PART 1.6 — SECURITY BOUNDARY (Part 19 + Part 6 + Part 7)

## Secrets (Part 19)

Kural: secret değer **asla** şu beşine yazılmaz: git, EvidenceLedger, artifact, UI, log.

### secretRef modeli (DESIGN_ONLY, henüz implemente değil)

```json
{
  "provider": "android-keystore | env | remote-vault",
  "scope": "runtime-service | node-agent | installer",
  "version": "1",
  "source": "opaque-locator-not-the-value-itself"
}
```

Secret değeri yalnızca **runtime'da**, ilgili provider tarafından çözülür (Android Keystore, işletim sistemi env, veya uzak vault). `secretRef` nesnesinin kendisi kanonik veri içinde (manifest, evidence, log) dolaşabilir çünkü değer taşımaz — yalnızca bir işaretçidir.

### Bugünkü ihlal (denetimde bulundu, düzeltilmedi — sahiplik operatöre ait)

`chatgpt_control_plane_tunnel.txt` düz metin bir OpenAI API anahtarı içeriyor, `.gitignore` kapsamında değil. Bu dosya **mevcut düz-metin secret dosyasını kanonik config'e dönüştürme** yasağının (Part 19: "Do not turn existing plaintext secret files into canonical config") tam olarak neden var olduğunu gösteren canlı örnek. Bu dosyaya dokunulmadı, `secretRef` modelinin bir parçası yapılmadı.

## Device Admission (Part 6)

### Durum makinesi

```
DISCOVERED → UNTRUSTED → OWNER_REVIEW → ADMITTED → CAPABILITY_VERIFIED → AVAILABLE
                                                                              │
                                                                              ▼
                                                                    STALE ⇄ OFFLINE
                                                                              │
                                                                              ▼
                                                                          REVOKED
```

| Cihaz | Bugünkü durum | Not |
|---|---|---|
| Xiaomi (mevcut) | `AVAILABLE` (PWA/browser-node seviyesinde) | Native runtime henüz yok — bu durum yalnızca tarayıcı-node için geçerli, native Node Agent için `DISCOVERED` bile değil (native app hiç kurulmadı) |
| Samsung | **DISCOVERED değil bile** | Mission açık talimatı: otomatik onboard edilmeyecek. Bu görevde Termux kurulumu, paket kurulumu, Android mutasyonu yapılmadı. |

### DeviceAttestationProvider (Part 6, dürüst placeholder)

```ts
interface DeviceAttestationProvider {
  attestDevice(nodeId: string): Promise<AttestationResult>;
}

type AttestationResult = {
  status: "NOT_IMPLEMENTED";
  proven: false;
  reason: "Hardware-backed device attestation (e.g. Play Integrity API) not yet integrated.";
};
```

Bu arayüz **çağrılabilir** ama her zaman `NOT_IMPLEMENTED/NOT_PROVEN` döner — sahte bir "PROVEN" asla üretilmez. `desktop/attestation.mjs`'teki mevcut mantıksal node identity (HMAC) bununla **karıştırılmaz**: biri yazılım kimliği (var), diğeri donanım bütünlüğü (yok).

## Capability Model (Part 7)

| Capability | Başlangıç durumu | Sonraki adım |
|---|---|---|
| `network.diagnostics.read` | DECLARED | Faz 4'te TESTED |
| `device.diagnostics.read` | DECLARED | Faz 4'te TESTED |
| `sensor.battery.read` | DECLARED | Faz 4'te TESTED (zaten mevcut PWA akışında ASK ekranında referans var — bkz. `allowedOperations` projection payload) |
| `aios.reality` | DECLARED | Faz 3'te TESTED (Node Agent heartbeat ile birlikte) |
| `aios.status` | DECLARED | Faz 3'te TESTED |

Kural: `DECLARED` durumundaki bir capability **hiçbir zaman** kullanıcıya "kullanılabilir" olarak reklam edilmez — yalnızca `AVAILABLE` durumundakiler Control Surface'ta görünür (Part 13/14, "No raw capability without VERIFIED").

## NO_FALSE_PROVEN ilkesi — bu üç bölümün ortak paydası

Attestation, capability ve artifact durumlarının hiçbiri "atla" ile ACTIVE/PROVEN'a geçemez. Her biri kendi zincirini (DECLARED→TESTED→VERIFIED→AVAILABLE / DISCOVERED→...→ACTIVE / DISCOVERED→...→ADMITTED) tam olarak yürütmeden nihai duruma giremez. Bu, mobil projeksiyonda zaten kanıtlanmış "PASS+stale asla Doğrulandı okunmaz" ilkesinin (bkz. önceki turlardaki `proofSemantic()`) Android fabric seviyesindeki genellemesidir.
