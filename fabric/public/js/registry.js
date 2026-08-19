/* ═══════════════════════════════════════════════════════════════
   AI-OS · COMPONENT REGISTRY
   ───────────────────────────────────────────────────────────────
   AI'nin (ve deterministik ekranlarin) kullanabilecegi TEK lego seti.
   Kurallar:
     · Her component (spec, ctx) => HTMLElement dondurur
     · Ham renk/olcu YAZMAZ - sadece css/tokens.css degiskenleri
     · Ikon sistemi TEK: Framework7 Icons (emoji KARISTIRILMAZ)
     · Zorunlu durumlar data-state ile: idle pressed loading pending
       success error disabled offline stale
   Bu sette OLMAYAN bir gorsel uretilemez. Tasarim butunlugu boyle korunur.
   ═══════════════════════════════════════════════════════════════ */

export const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

const icon = (name) => {
  const i = el("i", "icon f7-icons");
  i.textContent = name;
  return i;
};

/** Ayni paket adi -> ayni renk (launcher avatarlari icin kararli) */
const PALETTE = ["#4ADE80", "#38BDF8", "#FBBF24", "#F472B6", "#A78BFA", "#34D399", "#FB923C", "#60A5FA"];
export const stableColor = (s) => {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

const applyState = (node, state) => { node.dataset.state = state || "idle"; return node; };

/** Tikla -> ctx.dispatch(action) ; component loading/success/error durumunu kendi yonetir */
function wireAction(node, action, ctx, opts = {}) {
  if (!action) return node;
  node.dataset.tap = "1";
  // Kart/satir native <button> degilse de tek, erisilebilir bir eylemdir:
  // dokunma, Enter ve Bosluk ayni dispatcher zincirini kullanir.
  if (node.tagName !== "BUTTON") {
    node.setAttribute("role", "button");
    node.tabIndex = 0;
    if (!node.getAttribute("aria-label")) node.setAttribute("aria-label", node.textContent?.trim() || "Eylem");
  }
  const invoke = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (node.dataset.state === "loading" || node.dataset.state === "disabled") return;
    applyState(node, "loading");
    try {
      const res = await ctx.dispatch(action);
      applyState(node, res && res.ok === false ? "error" : "success");
      if (opts.onResult) opts.onResult(res, node);
      setTimeout(() => applyState(node, "idle"), 1400);
    } catch (err) {
      applyState(node, "error");
      setTimeout(() => applyState(node, "idle"), 1800);
    }
  };
  node.addEventListener("click", invoke);
  if (node.tagName !== "BUTTON") {
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") invoke(e);
    });
  }
  return node;
}

/* ══════════════════ PRIMITIVES ══════════════════ */

/** Section — sayfa gruplama. Retro karakter: mono micro-label + ince cizgi */
function Section(spec, ctx) {
  const n = el("section", "c-section");
  if (spec.title) {
    const h = el("header");
    h.appendChild(el("span", "t", spec.title));
    h.appendChild(el("span", "rule"));
    if (spec.trailing) h.appendChild(el("span", "t", spec.trailing));
    n.appendChild(h);
  }
  const body = el("div", "body" + (spec.layout === "grid-2" ? " grid-2" : spec.layout === "grid-4" ? " grid-4" : ""));
  (spec.children || []).forEach((c) => {
    const child = render(c, ctx);
    if (child) body.appendChild(child);
  });
  n.appendChild(body);
  return n;
}

/** Stack — sinirli flex layout; serbest stil/olcu dili DEGILDIR. */
function Stack(spec, ctx) {
  const n = el("div", "c-stack");
  n.dataset.direction = spec.direction || "column";
  n.dataset.align = spec.align || "stretch";
  n.dataset.gap = String(spec.gap == null ? 2 : spec.gap);
  (spec.children || []).forEach((c) => {
    const child = render(c, ctx);
    if (child) n.appendChild(child);
  });
  return n;
}

/** ScrollRegion — native CSS overflow; screen'in genel scroll'unu degistirmez. */
function ScrollRegion(spec, ctx) {
  const n = el("div", "c-scroll-region");
  n.style.maxHeight = `${spec.maxHeight}px`;
  n.setAttribute("role", "region");
  if (spec.title) n.setAttribute("aria-label", spec.title);
  (spec.children || []).forEach((c) => {
    const child = render(c, ctx);
    if (child) n.appendChild(child);
  });
  return n;
}

/** Range — native draggable control; input yalniz local state'i gunceller,
 * change ise tek dispatcher action'i uretir. */
function Range(spec, ctx) {
  const n = el("div", "c-range");
  const id = `range-${crypto.randomUUID()}`;
  const head = el("div", "head");
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = spec.label || spec.title || "Değer";
  const output = document.createElement("output");
  output.htmlFor = id;
  output.textContent = String(spec.value);
  head.append(label, output);
  const input = document.createElement("input");
  input.id = id;
  input.type = "range";
  input.min = String(spec.min);
  input.max = String(spec.max);
  input.step = String(spec.step);
  input.value = String(spec.value);
  input.addEventListener("input", () => {
    output.textContent = input.value;
    n.dataset.value = input.value;
  });
  input.addEventListener("change", async () => {
    const payload = { ...(spec.action.payload || {}), [spec.valueKey]: input.valueAsNumber };
    input.disabled = true;
    applyState(n, "loading");
    try {
      const res = await ctx.dispatch({ ...spec.action, payload });
      applyState(n, res && res.ok === false ? "error" : "success");
    } catch (err) {
      console.error("[fabric:range:dispatch]", err);
      applyState(n, "error");
    } finally {
      input.disabled = false;
      setTimeout(() => applyState(n, "idle"), 1400);
    }
  });
  n.append(head, input);
  n.dataset.value = input.value;
  return n;
}

/** Tile — state + ana action (Home Assistant Tile Card modeli) */
function Tile(spec, ctx) {
  const n = el("div", "c-card c-tile");
  n.dataset.on = spec.on ? "1" : "0";
  if (spec.tone) n.dataset.tone = spec.tone;
  applyState(n, spec.state);

  const head = el("div", "head");
  head.appendChild(el("span", "dot"));
  head.appendChild(el("span", "name", spec.name || ""));
  n.appendChild(head);

  if (spec.value != null) n.appendChild(el("div", "value", String(spec.value)));
  if (spec.meta) n.appendChild(el("div", "meta", spec.meta));

  if (spec.action) {
    const wrap = el("div", "act");
    const b = el("button", "c-btn", spec.actionLabel || "AÇ");
    b.dataset.variant = spec.on ? "primary" : "ghost";
    wireAction(b, spec.action, ctx, {
      onResult: (res) => {
        if (res && res.ok !== false && spec.toggles) {
          const now = n.dataset.on === "1" ? "0" : "1";
          n.dataset.on = now;
          b.dataset.variant = now === "1" ? "primary" : "ghost";
        }
      },
    });
    wrap.appendChild(b);
    n.appendChild(wrap);
  } else if (spec.tap) {
    wireAction(n, spec.tap, ctx);
  }
  return n;
}

/** InfoCard — salt bilgi */
function InfoCard(spec, ctx) {
  const n = el("div", "c-card");
  applyState(n, spec.state);
  const row = el("div", "c-row");
  if (spec.icon) { const i = icon(spec.icon); i.style.color = "var(--fg-mute)"; row.appendChild(i); }
  const g = el("div", "c-grow");
  if (spec.title) g.appendChild(el("div", "c-title", spec.title));
  if (spec.subtitle) g.appendChild(el("div", "c-sub", spec.subtitle));
  row.appendChild(g);
  n.appendChild(row);
  if (spec.body) n.appendChild(el("div", "c-body", spec.body));
  return n;
}

/** ActionCard — tek ana eylem */
function ActionCard(spec, ctx) {
  const n = el("div", "c-card");
  applyState(n, spec.state);
  const row = el("div", "c-row");
  if (spec.icon) { const i = icon(spec.icon); i.style.color = "var(--primary)"; row.appendChild(i); }
  const g = el("div", "c-grow");
  g.appendChild(el("div", "c-title", spec.title || ""));
  if (spec.subtitle) g.appendChild(el("div", "c-sub", spec.subtitle));
  row.appendChild(g);
  const chev = icon("chevron_right");
  chev.style.color = "var(--fg-mute)";
  chev.style.fontSize = "16px";
  row.appendChild(chev);
  n.appendChild(row);
  wireAction(n, spec.action, ctx);
  return n;
}

/** TaskCard — calisan async gorev (Activity Center'in omurgasi) */
function TaskCard(spec, ctx) {
  const n = el("div", "c-card");
  applyState(n, spec.state);
  const row = el("div", "c-row");
  const g = el("div", "c-grow");
  g.appendChild(el("div", "c-title", spec.title || ""));
  if (spec.source) g.appendChild(el("div", "c-sub", spec.source));
  row.appendChild(g);
  row.appendChild(StatusChip({ label: spec.status || "IDLE", tone: spec.tone, pulse: spec.state === "loading" }, ctx));
  n.appendChild(row);

  if (spec.progress != null || spec.state === "loading") {
    const p = el("div", "c-progress");
    if (spec.tone) p.dataset.tone = spec.tone === "ok" ? "" : spec.tone;
    if (spec.progress == null) p.dataset.indeterminate = "1";
    const bar = el("i");
    if (spec.progress != null) bar.style.width = Math.max(0, Math.min(100, spec.progress)) + "%";
    p.appendChild(bar);
    n.appendChild(p);
  }
  if (spec.elapsed) {
    const f = el("div", "c-sub mono");
    f.textContent = spec.elapsed;
    n.appendChild(f);
  }
  if (spec.actions && spec.actions.length) {
    const bar = el("div", "c-btn-row");
    bar.style.marginTop = "var(--sp-3)";
    spec.actions.forEach((a) => {
      const b = el("button", "c-btn", a.label);
      if (a.variant) b.dataset.variant = a.variant;
      wireAction(b, a.action, ctx);
      bar.appendChild(b);
    });
    n.appendChild(bar);
  }
  return n;
}

/** AgentCard — A2A peer */
function AgentCard(spec, ctx) {
  const n = el("div", "c-card c-tile");
  n.dataset.on = spec.online ? "1" : "0";
  n.dataset.tone = "info";
  applyState(n, spec.online ? "idle" : "offline");
  const head = el("div", "head");
  head.appendChild(el("span", "dot"));
  head.appendChild(el("span", "name", spec.name || ""));
  head.appendChild(el("span", "c-grow"));
  head.appendChild(StatusChip({ label: spec.status || (spec.online ? "READY" : "OFFLINE"), tone: spec.online ? "ok" : "idle" }, ctx));
  n.appendChild(head);
  if (spec.role) n.appendChild(el("div", "meta", spec.role));
  if (spec.detail) n.appendChild(el("div", "meta", spec.detail));
  if (spec.action) {
    const wrap = el("div", "act");
    const b = el("button", "c-btn", spec.actionLabel || "AÇ");
    b.dataset.variant = "ghost";
    wireAction(b, spec.action, ctx);
    wrap.appendChild(b);
    n.appendChild(wrap);
  }
  return n;
}

/** AppTile — Android uygulamasi (launcher) */
function AppTile(spec, ctx) {
  const n = el("div", "c-app");
  n.setAttribute("role", "button");
  n.tabIndex = 0;
  n.setAttribute("aria-label", `${spec.name || spec.pkg || "Uygulama"} aç`);
  // GERCEK ikon: Fabric /appicon/<pkg> ile sunuyor (once APK, sonra ag).
  // Harf-avatar altta durur, ikon yuklenince ustunu kapatir.
  //
  // DIKKAT: <img> DOM'a HEMEN eklenir. Onceki surumde img detached iken
  // loading="lazy" ile yuklenmeye calisiliyordu; tarayici belgede OLMAYAN
  // bir oge icin lazy yuklemeyi hic baslatmaz, bu yuzden onload asla
  // tetiklenmiyor ve ikonlar hicbir zaman gorunmuyordu (2026-08-16).
  const ic = el("div", "ic");
  ic.style.background = stableColor(spec.pkg || spec.name || "?");
  if (spec.icon && !spec.pkg) {
    ic.appendChild(icon(spec.icon));
  } else {
    ic.appendChild(el("span", "letter", (spec.name || "?").charAt(0).toUpperCase()));
  }
  if (spec.pkg) {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = "";
    img.src = "/appicon/" + encodeURIComponent(spec.pkg);
    img.addEventListener("load", () => {
      ic.classList.add("has-icon");
      ic.style.background = "transparent";
    });
    ic.appendChild(img);
  }
  n.appendChild(ic);
  n.appendChild(el("div", "nm", spec.name || spec.pkg || ""));
  const open = (e) => { e.preventDefault(); ctx.dispatch(spec.action || { type: "app.open", payload: { pkg: spec.pkg } }); };
  n.addEventListener("click", open);
  n.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") open(e); });
  if (spec.longPress) {
    let timer = null;
    const start = () => { timer = setTimeout(() => ctx.dispatch(spec.longPress), 480); };
    const stop = () => { if (timer) clearTimeout(timer); timer = null; };
    n.addEventListener("touchstart", start, { passive: true });
    n.addEventListener("touchend", stop);
    n.addEventListener("touchmove", stop);
    n.addEventListener("mousedown", start);
    n.addEventListener("mouseup", stop);
    n.addEventListener("mouseleave", stop);
  }
  return n;
}

/** ListRow — settings/list satiri */
function ListRow(spec, ctx) {
  const n = el("div", "c-rowitem");
  if (spec.tone) n.dataset.tone = spec.tone;
  applyState(n, spec.state);
  if (spec.icon) { const l = el("div", "lead"); l.appendChild(icon(spec.icon)); n.appendChild(l); }
  const g = el("div", "c-grow");
  g.appendChild(el("div", "c-title", spec.title || ""));
  if (spec.subtitle) g.appendChild(el("div", "c-sub", spec.subtitle));
  n.appendChild(g);
  if (spec.chip) n.appendChild(StatusChip(spec.chip, ctx));
  else if (spec.trailing) n.appendChild(el("div", "trail", spec.trailing));
  if (spec.action) {
    const chev = icon("chevron_right");
    chev.classList.add("nav-affordance");
    chev.setAttribute("aria-hidden", "true");
    n.appendChild(chev);
    wireAction(n, spec.action, ctx);
  }
  return n;
}

/** List — ListRow kapsayicisi */
function List(spec, ctx) {
  const n = el("div", "c-list");
  (spec.children || spec.rows || []).forEach((r) => n.appendChild(ListRow(r, ctx)));
  return n;
}

/** StatusChip — ONLINE / WAITING / WORKING ... */
function StatusChip(spec, ctx) {
  const n = el("span", "c-chip", (spec.label || "").toUpperCase());
  n.dataset.tone = spec.tone || "idle";
  if (spec.pulse) n.dataset.pulse = "1";
  return n;
}

/** Metric — pil, RAM, CPU (mono, sistem metadata) */
function Metric(spec, ctx) {
  const n = el("div", "c-metric");
  if (spec.tone) n.dataset.tone = spec.tone;
  n.appendChild(el("div", "k", spec.label || ""));
  const v = el("div", "v");
  v.textContent = spec.value == null ? "—" : String(spec.value);
  if (spec.unit) { const u = el("span", "u", spec.unit); v.appendChild(u); }
  n.appendChild(v);
  if (spec.progress != null) {
    const p = el("div", "c-progress");
    if (spec.tone && spec.tone !== "ok") p.dataset.tone = spec.tone;
    const bar = el("i");
    bar.style.width = Math.max(0, Math.min(100, spec.progress)) + "%";
    p.appendChild(bar);
    n.appendChild(p);
  }
  return n;
}

/** Progress */
function Progress(spec, ctx) {
  const n = el("div", "c-progress");
  if (spec.tone) n.dataset.tone = spec.tone;
  if (spec.value == null) n.dataset.indeterminate = "1";
  const bar = el("i");
  if (spec.value != null) bar.style.width = Math.max(0, Math.min(100, spec.value)) + "%";
  n.appendChild(bar);
  return n;
}

/** ActionReceipt — AI eyleminin sonucu. AI-OS'a ozgu, klasik mobilde yok. */
function ActionReceipt(spec, ctx) {
  const n = el("div", "c-receipt");
  applyState(n, spec.state || "success");
  const head = el("div", "rhead");
  head.appendChild(icon(spec.state === "error" ? "xmark_circle_fill"
    : spec.state === "pending" ? "clock_fill" : "checkmark_circle_fill"));
  head.appendChild(el("span", null,
    spec.state === "error" ? "FAILED" : spec.state === "pending" ? "RUNNING" : "COMPLETED"));
  n.appendChild(head);

  (spec.steps || []).forEach((s) => {
    const r = el("div", "step");
    r.appendChild(el("span", "sname", s.name));
    if (s.change) r.appendChild(el("span", "schange", s.change));
    if (s.ms != null) r.appendChild(el("span", "sms", s.ms + " ms"));
    n.appendChild(r);
  });

  const foot = el("div", "rfoot");
  if (spec.executor) {
    const e = el("span", "k-micro");
    e.textContent = "EXECUTOR · " + spec.executor;
    foot.appendChild(e);
  }
  foot.appendChild(el("span", "c-grow"));
  if (spec.undo) {
    const u = el("button", "c-btn", "GERİ AL");
    u.dataset.variant = "danger";
    wireAction(u, spec.undo, ctx);
    foot.appendChild(u);
  }
  if (spec.details) {
    const d = el("button", "c-btn", "DETAY");
    d.dataset.variant = "ghost";
    wireAction(d, spec.details, ctx);
    foot.appendChild(d);
  }
  if (foot.children.length > 1) n.appendChild(foot);
  return n;
}

/** Button / ButtonRow */
function Button(spec, ctx) {
  const b = el("button", "c-btn", spec.label || "");
  if (spec.variant) b.dataset.variant = spec.variant;
  applyState(b, spec.state);
  wireAction(b, spec.action, ctx);
  return b;
}
function ButtonRow(spec, ctx) {
  const n = el("div", "c-btn-row");
  (spec.children || spec.buttons || []).forEach((b) => n.appendChild(Button(b, ctx)));
  return n;
}

/** Skeleton — bekleme */
function Skeleton(spec, ctx) {
  const n = el("div");
  const rows = spec.rows || 3;
  for (let i = 0; i < rows; i++) {
    const s = el("div", "c-skel");
    if (spec.height) s.style.height = spec.height;
    s.style.width = i === rows - 1 ? "58%" : i % 2 ? "82%" : "100%";
    n.appendChild(s);
  }
  return n;
}

/** EmptyState */
function EmptyState(spec, ctx) {
  const n = el("div", "c-empty");
  n.appendChild(icon(spec.icon || "tray"));
  n.appendChild(el("div", "t", spec.title || "Kayıt yok"));
  if (spec.detail) n.appendChild(el("div", "d", spec.detail));
  if (spec.action) {
    const b = el("button", "c-btn", spec.actionLabel || "YENİLE");
    b.dataset.variant = "ghost";
    wireAction(b, spec.action, ctx);
    n.appendChild(b);
  }
  return n;
}

/** ErrorState — kurtarma yolu SUNAR */
function ErrorState(spec, ctx) {
  const n = el("div", "c-error");
  n.appendChild(icon(spec.icon || "exclamationmark_triangle_fill"));
  n.appendChild(el("div", "t", spec.title || "Bir şey ters gitti"));
  if (spec.detail) n.appendChild(el("div", "d", spec.detail));
  if (spec.action) {
    const b = el("button", "c-btn", spec.actionLabel || "TEKRAR DENE");
    b.dataset.variant = "primary";
    wireAction(b, spec.action, ctx);
    n.appendChild(b);
  }
  return n;
}

/** Text — duz metin (Hermes cevabi gibi; sans-serif, okunabilir) */
function Text(spec, ctx) {
  const n = el("div", "c-body hermes-text");
  n.textContent = spec.text || "";
  if (spec.mono) n.classList.add("mono");
  return n;
}

/* ══════════════════ REGISTRY ══════════════════ */

export const REGISTRY = {
  section: Section,
  tile: Tile,
  "info-card": InfoCard,
  "action-card": ActionCard,
  "task-card": TaskCard,
  "agent-card": AgentCard,
  "app-tile": AppTile,
  list: List,
  "list-row": ListRow,
  "status-chip": StatusChip,
  metric: Metric,
  progress: Progress,
  "action-receipt": ActionReceipt,
  button: Button,
  "button-row": ButtonRow,
  skeleton: Skeleton,
  "empty-state": EmptyState,
  "error-state": ErrorState,
  text: Text,
  stack: Stack,
  "scroll-region": ScrollRegion,
  range: Range,
};

/** Tek bir spec dugumunu DOM'a cevirir. Bilinmeyen tip -> ErrorState (sessiz kaybolmaz). */
export function render(node, ctx) {
  if (!node || !node.type) return null;
  const fn = REGISTRY[node.type];
  if (!fn) {
    return ErrorState({ title: "Bilinmeyen bileşen", detail: node.type }, ctx);
  }
  try {
    return fn(node, ctx);
  } catch (err) {
    return ErrorState({ title: "Bileşen çizilemedi", detail: node.type + " · " + err.message }, ctx);
  }
}
