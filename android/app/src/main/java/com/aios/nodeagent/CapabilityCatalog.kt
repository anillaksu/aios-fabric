package com.aios.nodeagent

/**
 * Single source of truth for how AIOS's 43 fabric capabilities are explained
 * to a human — used by BOTH the in-app onboarding tour (OnboardingScreen.kt)
 * and docs/PLAY_STORE_LISTING.md §2. Editing this file is how both surfaces
 * stay identical; docs/PLAY_STORE_LISTING.md §2's table must be regenerated
 * from this list, not maintained by hand a second time.
 *
 * Owner's rule this encodes: nothing is hidden from the user at install time,
 * every capability — including the ones that look unusual (script.run,
 * shizuku.start) but are legal on your own device — is named plainly with
 * what it does and does not do.
 */
data class CapabilityDescriptor(
    val id: String,
    val title: String,
    val whatItDoes: String,
    val whatItDoesNot: String,
)

data class CapabilityGroup(
    val title: String,
    val items: List<CapabilityDescriptor>,
)

object CapabilityCatalog {
    val groups: List<CapabilityGroup> = listOf(
        CapabilityGroup(
            "Cihazını gerçekten tanıma",
            listOf(
                CapabilityDescriptor("sensor.battery.read", "Pil durumu", "Şarj/sıcaklık/sağlığı gerçek zamanlı okur", "Arka planda sürekli izlemez"),
                CapabilityDescriptor("sensor.location.read", "Konum", "Yalnız sen istediğinde konumu okur", "Arka planda takip etmez"),
                CapabilityDescriptor("wifi.info", "Ağ bilgisi", "Bağlı olduğun ağı gösterir", "Şifre/trafik okumaz"),
                CapabilityDescriptor("device.diagnostics.read", "Cihaz bilgisi", "Model, SDK, ABI gösterir", "Kişisel dosyalara erişmez"),
                CapabilityDescriptor("device.build_profile.read", "Donanım profili", "SoC, RAM, depolama, Vulkan desteğini ölçer", "Ölçemediğini NOT_MEASURED olarak dürüstçe işaretler"),
                CapabilityDescriptor("network.diagnostics.read", "Ağ tanılama", "WiFi/hücresel türünü ve doğrulamayı gösterir", "Paket içeriğini okumaz"),
            ),
        ),
        CapabilityGroup(
            "Uygulama ve içerik yönetimi",
            listOf(
                CapabilityDescriptor("app.list", "Uygulama listesi", "Yüklü uygulamaları listeler", "Uygulama verisini okumaz"),
                CapabilityDescriptor("app.open", "Uygulama aç", "Seçtiğin uygulamayı açar", "Uygulama içine müdahale etmez"),
                CapabilityDescriptor("app.freeze", "Uygulamayı durdur", "Bir uygulamayı geçici durdurur", "Kalıcı silme değildir"),
                CapabilityDescriptor("app.unfreeze", "Uygulamayı devam ettir", "Durdurulmuş uygulamayı geri getirir", ""),
                CapabilityDescriptor("app.labels.resolve", "Uygulama isimleri", "Paket adlarını okunabilir isme çevirir", ""),
                CapabilityDescriptor("appicons.network", "Uygulama ikonları", "İkonları gösterir", ""),
                CapabilityDescriptor("doc.create", "Belge oluştur", "Yeni belge oluşturur", ""),
                CapabilityDescriptor("file.share", "Dosya paylaş", "Seçtiğin dosyayı paylaşır", "İzinsiz dosya taramaz"),
                CapabilityDescriptor("share.text", "Metin paylaş", "Metni başka uygulamaya gönderir", ""),
                CapabilityDescriptor("clipboard.get", "Panoyu oku", "Yalnız sen tetiklediğinde panoyu okur", "Arka planda izlemez"),
                CapabilityDescriptor("clipboard.set", "Panoya yaz", "Panoya metin yazar", ""),
            ),
        ),
        CapabilityGroup(
            "Medya ve ortam kontrolü",
            listOf(
                CapabilityDescriptor("media.control", "Medya kontrolü", "Oynat/duraklat/sonraki", ""),
                CapabilityDescriptor("media.play_search", "Medya ara-oynat", "Arama sonucunu oynatır", ""),
                CapabilityDescriptor("volume.read", "Ses seviyesi oku", "Mevcut ses seviyesini okur", ""),
                CapabilityDescriptor("volume.set", "Ses seviyesi ayarla", "Ses seviyesini değiştirir", ""),
                CapabilityDescriptor("brightness.set", "Parlaklık ayarla", "Ekran parlaklığını değiştirir", ""),
                CapabilityDescriptor("torch.set", "El feneri", "Feneri açar/kapar", ""),
                CapabilityDescriptor("tts.speak", "Sesli okuma", "Metni seslendirir", ""),
                CapabilityDescriptor("speech.listen", "Konuşma dinleme", "Konuşmanı yazıya çevirir", "Sürekli dinleme değildir, sen başlatırsın"),
            ),
        ),
        CapabilityGroup(
            "Bildirim ve iletişim",
            listOf(
                CapabilityDescriptor("notification.send", "Bildirim gönder", "Bildirim oluşturur", ""),
                CapabilityDescriptor("whatsapp.send", "WhatsApp mesajı", "Yalnız senin açıkça onayladığın tek mesajı kendi hesabından gönderir", "Toplu/otomatik spam göndermez — varsayılan KAPALI, sen açarsın"),
                CapabilityDescriptor("deeplink.open", "Derin bağlantı aç", "Uygulama-içi bağlantı açar", ""),
                CapabilityDescriptor("link.open", "Bağlantı aç", "Bir kit zincirinin sonucunu açar (ör. Spotify arama)", ""),
                CapabilityDescriptor("intent.run", "Intent çalıştır", "Android intent'ini tetikler", ""),
            ),
        ),
        CapabilityGroup(
            "Otomasyon ve genişletilmiş kontrol",
            listOf(
                CapabilityDescriptor("script.run", "Betik çalıştır", "Kendi onayladığın betiği cihazında çalıştırır", "Tasker/MacroDroid'deki gibi meşru bir kategori, gizli arka kapı değil"),
                CapabilityDescriptor("shizuku.status", "Shizuku durumu", "Google'ın desteklediği açık ADB servisinin durumunu gösterir", ""),
                CapabilityDescriptor("shizuku.start", "Shizuku başlat", "Aynı servisi başlatır", "Gizli bir yetki yükseltme değildir, açık kaynaklı bilinen bir mekanizmadır"),
                CapabilityDescriptor("ui.tap", "Dokunuş simülasyonu", "Ekranda dokunuş üretir", "Yalnız senin tanımladığın otomasyon akışında"),
                CapabilityDescriptor("wakelock.acquire", "Uykuyu engelle", "Cihazın uykuya geçmesini geçici engeller", ""),
                CapabilityDescriptor("wakelock.release", "Uykuyu serbest bırak", "Engeli kaldırır", ""),
                CapabilityDescriptor("kit.list", "Otomasyon kitleri", "Kayıtlı otomasyon zincirlerini listeler", ""),
                CapabilityDescriptor("overlay.permission.read", "Üste açılma izni", "Diğer uygulamaların üzerine çizim izninin durumunu okur", "İzni kendiliğinden açmaz — yalnız durumu gösterir"),
                CapabilityDescriptor("battery.optimization.status", "Pil optimizasyonu durumu", "Uygulamanın pil optimizasyonundan muaf olup olmadığını okur", ""),
                CapabilityDescriptor("notification.listener.status", "Bildirim dinleme izni", "Bildirim erişiminin verilip verilmediğini okur", "Bildirim içeriğini bu capability okumaz, yalnız izin durumunu okur"),
                CapabilityDescriptor("microphone.permission.status", "Mikrofon izni", "Mikrofon izninin verilip verilmediğini okur", "Ses kaydetmez, yalnız izin durumunu okur"),
                CapabilityDescriptor("screen.capture.status", "Ekran yakalama (MediaProjection)", "Gerçek Android ekran yakalama API'siyle anlık görüntü alır — her seferinde açık sistem onayı ister", "Arka planda sessizce çalışmaz; zorunlu bildirim her zaman görünür, gizlenemez"),
                CapabilityDescriptor("remote.control.status", "Uzaktan kontrol (çift yönlü)", "Erişilebilirlik servisi üzerinden gerçek dokunuş/kaydırma gönderir — AnyDesk'in eklentisiyle aynı resmi Android API", "Yalnız Ayarlar > Erişilebilirlik'ten sen etkinleştirdiğinde çalışır, ekran içeriğini okumaz"),
            ),
        ),
        CapabilityGroup(
            "Yapay zeka çekirdeği",
            listOf(
                CapabilityDescriptor("llm.generate", "AI metin üretimi", "Tercih ettiğin modelle metin üretir", "Hangi model/sağlayıcı kullanıldığı her zaman görünür"),
                CapabilityDescriptor("aios.reality", "Sistem gerçekliği", "Neyin gerçekten kanıtlı çalıştığını gösterir", "Sahte/kanıtsız durum göstermez"),
                CapabilityDescriptor("aios.status", "Sistem durumu", "Aktif çalışmayı gösterir", ""),
            ),
        ),
        CapabilityGroup(
            // Yeni bir aktarım mekanizması DEĞİL — mevcut fabric/src/capabilities.ts
            // "a2a.delegate" (peer="pc") zaten PC'deki Hermes'e serbest metinle görev
            // devrediyor; bu grup yalnız o mevcut yolu kullanıcıya görünür/adlandırılmış
            // kılıyor. Kaynak: ~/AppData/Local/hermes/config.yaml platform_toolsets.cli.
            "PC'deki Hermes'e devir (a2a.delegate üzerinden)",
            listOf(
                CapabilityDescriptor("hermes.web", "Web arama/okuma", "Hermes'e web'de arama/sayfa okuma görevi devreder", "Doğrudan telefon üzerinde çalışmaz, PC'ye gider"),
                CapabilityDescriptor("hermes.browser", "Tarayıcı otomasyonu", "Hermes'in PC'deki tarayıcısını yönlendirir", ""),
                CapabilityDescriptor("hermes.computer_use", "PC ekran kontrolü", "Hermes'in PC ekranında eylem yapmasını ister", "Yalnız senin onayınla (risk: ask)"),
                CapabilityDescriptor("hermes.code_execution", "Kod çalıştırma", "PC'de kod/betik çalıştırır", "Sandbox/timeout sınırlı (300sn)"),
                CapabilityDescriptor("hermes.terminal", "Terminal komutu", "PC'de kabuk komutu çalıştırır", "Yıkıcı komutlar allowlist'te engelli"),
                CapabilityDescriptor("hermes.file", "Dosya işlemleri (PC)", "PC'deki dosyalara erişir", ""),
                CapabilityDescriptor("hermes.image_gen", "Görsel üretimi", "Metinden görsel üretir", ""),
                CapabilityDescriptor("hermes.vision", "Görsel analiz", "Gönderdiğin görseli analiz eder", ""),
                CapabilityDescriptor("hermes.tts", "PC'de sesli okuma", "PC'de metni seslendirir", ""),
                CapabilityDescriptor("hermes.memory", "Hafıza sorgusu", "Hermes'in kendi hafızasını sorgular", ""),
                CapabilityDescriptor("hermes.session_search", "Geçmiş oturum arama", "Önceki konuşmalarda arama yapar", ""),
                CapabilityDescriptor("hermes.todo", "Yapılacaklar", "Görev ekler/listeler", ""),
                CapabilityDescriptor("hermes.kanban", "Kanban panosu", "Panoyu günceller", ""),
                CapabilityDescriptor("hermes.cronjob", "Zamanlanmış görev", "PC'de zamanlanmış iş kurar", ""),
                CapabilityDescriptor("hermes.clarify", "Netleştirme sorusu", "Hermes belirsizse sana geri soru sorar", ""),
            ),
        ),
    )

    val totalCount: Int get() = groups.sumOf { it.items.size }
}
