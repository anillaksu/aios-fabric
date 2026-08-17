// Bagimliliksiz, minimal PDF ureteci (A4, tek/cok sayfa duz metin).
//
// NEDEN ELDE YAZILDI: artefakt #5 ("A4 -> PDF -> WhatsApp") yarim kalmisti.
// Eksik parca belge URETIMIYDI. Telefonda npm paketi kurmak (pdfkit ~2MB +
// fontlar) hem yer hem de proot disinda derleme riski demek; oysa duz metin
// bir PDF, PDF 1.4'un cekirdek nesneleriyle ~100 satirda yazilabiliyor ve
// standart 14 fonttan biri olan Helvetica goomulu oldugu icin font gomme
// gerekmiyor.
//
// SINIR: yalnizca DUZ METIN. Gorsel, tablo ve gomulu font yok. Turkce
// karakterler icin WinAnsi (cp1252) kullaniliyor - "ğ, ş, İ, ı" bu kodlamada
// YOK, o yuzden ASCII karsiliklarina duselerek yaziliyor (asagiyi gor).
// Sessizce bozuk karakter basmaktansa okunabilir harf basmak dogru davranis.

// NOT: bu `export` dosyanin BASINDA olmali. Node, icinde import/export
// GORMEDIGI bir .ts dosyasini once CommonJS olarak ayristirmayi deniyor ve
// ilk tur aciklamasinda ("const FOLD: Record<...>") sozdizimi hatasi verip
// duruyor - tur soyma hic devreye girmiyor. Ilk ifade bir export olunca
// dosya bastan modul sayiliyor ve sorun kayboluyor. (2026-08-16'da yasandi.)
export const PAGE_A4 = { w: 595.28, h: 841.89 };
const A4 = PAGE_A4;
const MARGIN = 56;              // ~2cm
const FONT_SIZE = 11;
const LINE_HEIGHT = 15.5;
const MAX_LINES = Math.floor((A4.h - MARGIN * 2) / LINE_HEIGHT);
const MAX_CHARS = 92;           // Helvetica 11pt icin guvenli satir uzunlugu

/** WinAnsi'de karsiligi olmayan Turkce harfleri en yakin okunabilir hale cevirir.
 *  Karakterler KACIS DIZISIYLE yazildi: dosya SSH/scp ile tasindiginda ya da
 *  farkli bir kodlamada acildiginda ham UTF-8 harflerin bozulma riski var
 *  (bir kez yasandi: dosya JS olarak ayristirilip derleme patladi). */
const FOLD: Record<string, string> = {
  "ğ": "g", "Ğ": "G",   // g breve
  "ş": "s", "Ş": "S",   // s cedilla
  "ı": "i", "İ": "I",   // noktasiz i / noktali I
  "–": "-", "—": "-",   // en/em dash
  "“": '"', "”": '"',   // egik cift tirnak
  "‘": "'", "’": "'",   // egik tek tirnak
  "•": "-", "…": "...", // madde imi, uc nokta
};

const FOLD_RE = /[ğĞşŞıİ–—“”‘’•…]/g;

function encodeText(s: string): string {
  return s.replace(FOLD_RE, (c) => FOLD[c] ?? c);
}

/** PDF string kacisi: ( ) ve \ ozel karakterlerdir. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Uzun satirlari KELIME SINIRINDA boler. */
function wrap(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, "    ");
    if (line.length <= MAX_CHARS) { out.push(line); continue; }
    let cur = "";
    for (const word of line.split(" ")) {
      if (!cur.length) { cur = word; continue; }
      if ((cur + " " + word).length <= MAX_CHARS) cur += " " + word;
      else { out.push(cur); cur = word; }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** Duz metinden A4 PDF uretir. Donen Buffer dogrudan diske yazilabilir. */
export function textToPdf(text: string, title = "Belge"): Buffer {
  const lines = wrap(encodeText(text));
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += MAX_LINES) pages.push(lines.slice(i, i + MAX_LINES));
  if (!pages.length) pages.push([""]);

  // ── PDF nesneleri ──
  // 1 Catalog · 2 Pages · 3 Font · sonra her sayfa icin Page + Contents
  const objects: string[] = [];
  const pageIds: number[] = [];
  let nextId = 4;
  for (let i = 0; i < pages.length; i++) {
    pageIds.push(nextId);
    nextId += 2;   // Page + Contents
  }

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;

  pages.forEach((pageLines, idx) => {
    const pageId = pageIds[idx];
    const contentId = pageId + 1;
    const y = A4.h - MARGIN;
    const body = pageLines
      .map((l, i) => (i === 0 ? `1 0 0 1 ${MARGIN} ${y} Tm (${esc(l)}) Tj` : `T* (${esc(l)}) Tj`))
      .join("\n");
    const stream = `BT\n/F1 ${FONT_SIZE} Tf\n${LINE_HEIGHT} TL\n${body}\nET`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });

  // ── Seri hale getir + xref tablosu ──
  const header = `%PDF-1.4\n`;
  let body = "";
  const offsets: number[] = [];
  for (let id = 1; id < nextId; id++) {
    offsets[id] = Buffer.byteLength(header + body, "latin1");
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(header + body, "latin1");
  let xref = `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextId; id++) {
    xref += String(offsets[id]).padStart(10, "0") + " 00000 n \n";
  }
  const trailer =
    `trailer\n<< /Size ${nextId} /Root 1 0 R /Info << /Title (${esc(encodeText(title))}) >> >>\n` +
    `startxref\n${xrefPos}\n%%EOF\n`;

  return Buffer.from(header + body + xref + trailer, "latin1");
}
