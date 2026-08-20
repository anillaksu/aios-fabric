/* Native DOM renderer for the read-only Formation Canvas projection. */

function nodeText(value) { return typeof value === "string" ? value : ""; }

export function mountFormationCanvas(host, projection, { onSelect, onBrowse } = {}) {
  host.innerHTML = "";
  const wrap = document.createElement("section");
  wrap.className = "formation-canvas-screen";
  const toolbar = document.createElement("div");
  toolbar.className = "formation-canvas-toolbar";
  const summary = document.createElement("span");
  summary.className = "k-micro";
  summary.textContent = `${projection.totalFormations} OLUŞUM · ${projection.links.filter((link) => link.kind === "reuse").length} YÜRÜTME İZİ`;
  const controls = document.createElement("div");
  controls.className = "formation-canvas-controls";
  const makeControl = (label, action, wide = false) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "formation-canvas-control";
    if (wide) button.dataset.wide = "1";
    button.textContent = label; button.setAttribute("aria-label", action);
    controls.appendChild(button); return button;
  };
  toolbar.append(summary, controls);

  const viewport = document.createElement("div");
  viewport.className = "formation-canvas-viewport";
  viewport.setAttribute("aria-label", "Formation Memory grafiği; iki parmakla yakınlaştır, sürükleyerek gez");
  const stage = document.createElement("div");
  stage.className = "formation-canvas-stage";
  stage.style.width = `${projection.bounds.width}px`;
  stage.style.height = `${projection.bounds.height}px`;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "formation-canvas-links");
  svg.setAttribute("width", String(projection.bounds.width));
  svg.setAttribute("height", String(projection.bounds.height));
  stage.appendChild(svg);

  const nodes = new Map(projection.nodes.map((node) => [node.id, node]));
  for (const link of projection.links) {
    const from = nodes.get(link.from); const to = nodes.get(link.to);
    if (!from || !to) continue;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(from.position.x + 112)); line.setAttribute("y1", String(from.position.y + 62));
    line.setAttribute("x2", String(to.position.x + 112)); line.setAttribute("y2", String(to.position.y + 12));
    line.setAttribute("data-kind", link.kind); svg.appendChild(line);
  }
  for (const node of projection.nodes) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "formation-canvas-node";
    button.dataset.kind = node.kind; button.style.left = `${node.position.x}px`; button.style.top = `${node.position.y}px`;
    button.setAttribute("aria-label", `${node.kind === "reuse-execution" ? "Yürütme izi" : "Formation"}: ${nodeText(node.title)}`);
    const kind = document.createElement("span"); kind.className = "k-micro";
    kind.textContent = node.kind === "reuse-execution" ? "REUSE / EXECUTION" : node.kind === "derived-formation" ? "DERIVED FORMATION" : "ROOT FORMATION";
    const title = document.createElement("strong"); title.textContent = nodeText(node.title);
    const subtitle = document.createElement("span"); subtitle.className = "formation-canvas-node-sub"; subtitle.textContent = nodeText(node.subtitle);
    button.append(kind, title, subtitle);
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", () => onSelect?.(node));
    stage.appendChild(button);
  }
  viewport.appendChild(stage); wrap.append(toolbar, viewport); host.appendChild(wrap);

  let transform = { x: 10, y: 10, z: 0.82 };
  const pointers = new Map(); let pinch = null;
  const apply = () => { stage.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.z})`; };
  // Geniş formation ağında tüm ilişkiyi bir bakışta görebilmek için alt
  // sınır dar mobil viewport'a göre değil graph'ın büyüyebilirliğine göre.
  const clampZoom = (value) => Math.max(0.24, Math.min(1.8, value));
  const zoom = (delta) => { transform = { ...transform, z: clampZoom(transform.z + delta) }; apply(); };
  if (onBrowse) makeControl("FORMATIONLAR", "Formation listesini aç", true).addEventListener("click", () => onBrowse());
  makeControl("−", "Uzaklaştır").addEventListener("click", () => zoom(-0.15));
  makeControl("+", "Yakınlaştır").addEventListener("click", () => zoom(0.15));
  makeControl("⌾", "Grafiği ortala").addEventListener("click", () => { transform = { x: 10, y: 10, z: 0.82 }; apply(); });
  viewport.addEventListener("pointerdown", (event) => {
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]; pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), z: transform.z };
    }
  });
  viewport.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId); if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()]; transform = { ...transform, z: clampZoom(pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance)) };
    } else transform = { ...transform, x: transform.x + event.clientX - previous.x, y: transform.y + event.clientY - previous.y };
    apply();
  });
  const release = (event) => { pointers.delete(event.pointerId); if (pointers.size < 2) pinch = null; };
  viewport.addEventListener("pointerup", release); viewport.addEventListener("pointercancel", release);
  viewport.addEventListener("wheel", (event) => { event.preventDefault(); zoom(event.deltaY > 0 ? -0.1 : 0.1); }, { passive: false });
  apply();
}
