// Fabric'in paylasilan tip tanimlari. Hicbir dosya baska bir yerden tip
// import etmez disinda - tek gercek kaynak burasi.

export type WorkClass = "REFLEX" | "THOUGHT" | "AGENT";

export interface Intent {
  type: string;                 // orn "sensor.battery.read", "screen.render", "app.freeze"
  payload?: Record<string, unknown>;
  correlationId?: string;       // verilmezse yeni id uretilir (kok intent)
  causationId?: string;         // bu intent'i tetikleyen event'in id'si (varsa)
  idempotencyKey?: string;      // ayni key ile tekrar POST -> ayni sonuc, yeniden calistirmaz
  /** Bu intent NEREDEN geldi? Universal Intent Envelope doldurur.
   *  Gorev karti "HEDEF / NE ANLADI / KIM YAPIYOR" alanlarini bundan cizer. */
  origin?: {
    source: string;      // ui | hermes | voice | share | agent | sensor | automation
    raw: string;         // kullanicinin HAM ifadesi
    by: string;          // anlamayi kim yapti: deterministic | llm | agent
    envelopeId: string;
  };
}

export interface FabricEvent {
  seq: number;                  // journal sira no (append-only, otomatik artan)
  id: string;                   // event'in kendi id'si (uuid)
  ts: number;                   // epoch ms
  type: string;                 // "intent.submitted" | "task.optimistic" | "task.completed" | "task.failed" | "task.interrupted" | ...
  correlationId: string;        // ayni is akisina ait tum event'leri baglar
  causationId: string | null;   // bu event'e sebep olan event'in id'si
  payload: unknown;
  idempotencyKey: string | null;
}

export type TaskStatus =
  | "pending"      // intent kabul edildi, henuz calismadi
  | "optimistic"   // iyimser projeksiyon uygulandi, gercek sonuc bekleniyor
  | "running"
  | "completed"
  | "failed"
  | "interrupted"  // crash recovery sirasinda yarim kalmis bulundu
  | "cancelled";   // kullanici iptal etti (kalan denemeler yapilmadi)

export interface TaskRecord {
  id: string;
  correlationId: string;
  class: WorkClass;
  type: string;
  payload: Record<string, unknown> | undefined;
  status: TaskStatus;
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
  attempts: number;

  // ─── AKTIF sekmesinin "kontrol merkezi" olabilmesi icin gereken alanlar ───
  /** Kullanicinin HAM ifadesi = HEDEF */
  goal?: string;
  /** Girisin geldigi kaynak = KIM ISTEDI */
  source?: string;
  /** Anlamayi kim yapti (deterministic/llm/agent) = NE ANLADI, KIM YORUMLADI */
  interpretedBy?: string;
  /** Su an hangi asamada: kabul | calisiyor | yeniden-deniyor | bitti */
  stage?: string;
  /** Neyi bekliyor (varsa) */
  waitingFor?: string;
  /** Geri alma icin eylem oncesi yakalanan durum (varsa) */
  undoCaptured?: unknown;
  /** Geri alma mumkunse kullaniciya gosterilecek etiket */
  undoLabel?: string;
}

export interface FabricState {
  tasks: Record<string, TaskRecord>;
  // capability-ozel projeksiyonlar (orn hangi uygulamalar donduruldu,
  // son sensor okumasi) - reducer'lar burayi gunceller.
  // NOT: v1'deki `screen` alani kaldirildi - AI-OS v2'de ekran deterministik
  // ve istemci tarafinda, LLM tarafindan uretilen bir HTML state'i yok.
  apps: Record<string, { frozen: boolean; lastAction?: string }>;
  sensors: Record<string, unknown>;
  // UI'nin canli akis gostermesi icin son N event (sinirli ring buffer)
  recentEvents: FabricEvent[];
  // B-13: risk:"ask" capability'ler icin insan onay kaydi, capability adiyla
  // anahtarlanir (bkz. approval.ts - scope bugun capability-duzeyinde,
  // artefakt-duzeyi kapsam Katman B gelince eklenir).
  approvals: Record<string, ApprovalRecord>;
}

export type ApprovalStatus = "granted" | "denied" | "revoked";

export interface ApprovalRecord {
  capability: string;
  status: ApprovalStatus;
  decidedAt: number;
  expiresAt?: number;
}

export type Reducer = (state: FabricState, event: FabricEvent) => FabricState;

export interface CapabilityResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface Capability {
  name: string;                 // logical capability adi, orn "sensor.battery.read"
  class: WorkClass;
  execute: (payload: Record<string, unknown> | undefined) => Promise<CapabilityResult>;
  maxRetries?: number;
  /**
   * Bu capability nin CIKTISI hassas mi? (2026-08-17 denetiminde eklendi)
   *
   * Journal append-only ve budanmiyor; task.completed olayi capability
   * sonucunu oldugu gibi tasiyor. Yani isaretlenmezse pano icerigi, ses
   * dokumu, kabuk ciktisi ve model yaniti KALICI olarak diske yazilir.
   * Isaretliyse journal a yalnizca bir OZET duser (orn "482 karakter"),
   * gercek deger surec belleginde kalir ve arayuze oradan verilir.
   */
  sensitiveResult?: boolean;
  /**
   * Bu capability'nin GIRDISINDE hassas olan alan adlari.
   * (2026-08-17 denetimi, IKINCI tur)
   *
   * Ilk turda yalnizca SONUC redakte edilmisti. Ikinci turda asil sizintinin
   * GIRDIDE oldugu goruldu: panoya yazilan bir parola, "clipboard.set" in
   * text alani olarak task.created + intent.understood + intent.dispatched
   * olaylarina BIRDEN dusuyordu; diskteki WAL dosyasinda 29 kez bulundu.
   * Burada adi gecen alanlar journal'a "N karakter" diye yazilir; gercek
   * deger yalnizca yurutmeye gider.
   */
  sensitiveFields?: string[];
  /**
   * Bu capability'nin CALISMADAN ONCE gerektirdigi izin duzeyi.
   * (2026-08-17, W1.1 - yetki katmani)
   *
   * "safe"   -> serbest calisir (salt-okuma ya da zararsiz/tersinir etki)
   * "notify" -> calisir, ama kullaniciya bildirim/journal ile gorunur kalir
   * "ask"    -> calismadan ONCE onay gerekir (dispatcher.ts bunu ZORUNLU kilar)
   *
   * Belirtilmezse "ask" varsayilir - kanitlanmadikca en kisitli secenek.
   * B-13 (2026-08-18) oncesi "ask" calisma zamaninda KOSULSUZ reddediliyordu.
   * Artik approval.ts:isApproved() kontrolune bagli - gecerli bir insan
   * onayi (approval.granted, suresi dolmamis) yoksa reddedilir, sessizce
   * izin verilmez. Onay AETHER'DAN DEGIL, Fabric'in KENDI journal'indan
   * gelir (dispatcher.ts:grantApproval/denyApproval/revokeApproval, insan-
   * tetikli server.ts /approvals/* uclarindan) - AETHER hala pasif, bu akisa
   * hic dahil degil (bkz. MIMARI_TEMEL.md SS9).
   */
  risk?: "safe" | "notify" | "ask";
  /**
   * Bu capability salt-okuma mi?
   *
   * `risk:"safe"` tek basina yeterli DEGILDIR: ses/fener/parlaklik gibi
   * yan etkili ama geri alinabilir eylemler de safe olabilir. Bu alan yalniz
   * /read'in journal'siz, dogrudan calistirabilecegi capability'leri acikca
   * isaretler. Belirtilmezse fail-closed (false) kabul edilir.
   */
  readOnly?: boolean;
}
// Not: iyimser (optimistic) projeksiyonlar capability basina degil,
// dispatcher.ts'te intent.type'a gore merkezi olarak tanimlanir - hangi
// alanlarin "aninda" degisecegini tek yerden gormek/degistirmek icin.

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  /** W2.3: A2A v1.0 protokol surumu - karsi taraf hangi surumu konustugumuzu buradan okur. */
  protocolVersion: string;
  /** W2.3: RPC adresi burada duyurulur - istemci taban URL'i tahmin etmez. */
  supportedInterfaces: { transport: string; url: string }[];
  capabilities: { streaming: boolean; pushNotifications: boolean };
  skills: { id: string; name: string; description: string }[];
}
