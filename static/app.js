// Occupation-gender bias dashboard. Plain JS + inline SVG, no libraries.
const SERIES = [
  { key: "gpt2", short: "GPT-2", color: "--s1", shape: "circle" },
  { key: "qwen", short: "Qwen2.5-0.5B", color: "--s2", shape: "square" },
  { key: "bert", short: "BERT", color: "--s3", shape: "triangle" },
  { key: "image", short: "SD-Turbo images", color: "--s4", shape: "diamond" },
];
const TEXT_KEYS = ["gpt2", "qwen", "bert"];
const state = { data: null, visible: { gpt2: true, qwen: true, bert: true } };
const $ = (s) => document.querySelector(s);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const pct = (v, d = 0) => (v * 100).toFixed(d) + "%";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tipAttr = (html) => `data-tip="${esc(html)}"`;
const seriesOf = (k) => SERIES.find((s) => s.key === k);

// ---------- theme ----------
function applyTheme(t) {
  if (t) document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
}
try { applyTheme(localStorage.getItem("theme")); } catch (e) {}
$("#themeBtn").addEventListener("click", () => {
  const dark = css("--surface") === "#1a1a19";
  const next = dark ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("theme", next); } catch (e) {}
  renderAll();
});

// ---------- tooltip ----------
const tip = $("#tip");
document.addEventListener("mousemove", (e) => {
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (!t) { tip.hidden = true; return; }
  tip.innerHTML = t.getAttribute("data-tip");
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
  tip.style.left = x + "px"; tip.style.top = y + "px";
});

// ---------- helpers ----------
function shape(kind, x, y, r, fill, extra = "") {
  const a = `fill="${fill}" class="mark" ${extra}`;
  if (kind === "square") return `<rect x="${x - r * 0.85}" y="${y - r * 0.85}" width="${r * 1.7}" height="${r * 1.7}" rx="1.5" ${a}/>`;
  if (kind === "triangle") return `<path d="M${x},${y - r * 1.1} L${x + r},${y + r * 0.75} L${x - r},${y + r * 0.75}Z" ${a}/>`;
  if (kind === "diamond") return `<path d="M${x},${y - r * 1.15} L${x + r * 1.15},${y} L${x},${y + r * 1.15} L${x - r * 1.15},${y}Z" ${a}/>`;
  return `<circle cx="${x}" cy="${y}" r="${r}" ${a}/>`;
}
function icon(s, size = 14) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 14 14" aria-hidden="true">${shape(s.shape, 7, 7, 5, css(s.color)).replace('class="mark"', "")}</svg>`;
}
function refIcon() {
  return `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><line x1="7" y1="1" x2="7" y2="13" stroke="${css("--ink-2")}" stroke-width="2.5"/></svg>`;
}
function pearson(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sx += (xs[i] - mx) ** 2; sy += (ys[i] - my) ** 2; }
  return sxy / Math.sqrt(sx * sy || 1);
}
function hexToRgb(h) { h = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return "rgb(" + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",") + ")"; }
function divColor(v) {  // male share 0..1 -> diverging colour, grey at 0.5
  const t = Math.max(-1, Math.min(1, (v - 0.5) * 2));
  return t >= 0 ? mix(css("--div-mid"), css("--div-m"), t) : mix(css("--div-mid"), css("--div-f"), -t);
}

// Male share (0..1) per occupation, per series key
function values(key) {
  const d = state.data;
  if (key === "image") return d.images ? Object.fromEntries(Object.entries(d.images.by_occupation).map(([o, v]) => [o, v.male_share])) : null;
  const m = d.models.find((m) => m.model === key);
  return m ? Object.fromEntries(Object.entries(m.by_occupation).map(([o, v]) => [o, v.male_share])) : null;
}
const realMale = (occ) => 1 - state.data.real_world_pct_female[occ] / 100;
const sortedOccs = () => [...state.data.occupations].sort((a, b) => state.data.real_world_pct_female[b] - state.data.real_world_pct_female[a]);
const available = (keys) => keys.filter((k) => values(k));

// ---------- KPI tiles ----------
function renderKpis() {
  const occs = state.data.occupations;
  $("#kpis").innerHTML = available(SERIES.map((s) => s.key)).map((k) => {
    const s = seriesOf(k), v = values(k);
    const vals = occs.map((o) => v[o]);
    const avg = vals.reduce((a, b) => a + b) / vals.length;
    const r = pearson(occs.map(realMale), vals);
    const male = vals.filter((x) => x > 0.5).length;
    return `<div class="kpi"><div class="name">${icon(s)} ${esc(s.short)}</div>
      <div class="val">${pct(avg)}<small>male on average</small></div>
      <div class="meta">Leans male on ${male} of ${occs.length} jobs · r = ${r.toFixed(2)} with US workforce</div></div>`;
  }).join("");
}

// ---------- dot plot ----------
function dotPlot(container, keys) {
  const el = $(container), W = Math.max(320, el.clientWidth);
  const narrow = W < 560, left = narrow ? 96 : 140, right = 16, top = 34, rowH = 38;
  const occs = sortedOccs(), H = top + occs.length * rowH + 8, pw = W - left - right;
  const x = (v) => left + v * pw;
  const offs = keys.length === 1 ? [0] : keys.map((_, i) => (i - (keys.length - 1) / 2) * 6);
  let s = `<svg width="${W}" height="${H}" role="img" aria-label="Dot plot of male share by occupation">`;
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    s += `<line x1="${x(t)}" x2="${x(t)}" y1="${top - 6}" y2="${H - 8}" class="${t === 0.5 ? "midline" : "gridline"}"/>`;
    s += `<text x="${x(t)}" y="${top - 12}" text-anchor="middle" class="axis-text">${t * 100}%</text>`;
  }
  s += `<text x="${x(0)}" y="11" class="axis-text">← leans female</text><text x="${x(1)}" y="11" text-anchor="end" class="axis-text">leans male →</text>`;
  occs.forEach((o, i) => {
    const cy = top + i * rowH + rowH / 2, rm = realMale(o);
    s += `<text x="0" y="${cy - 2}" class="row-label">${esc(o)}</text>`;
    s += `<text x="0" y="${cy + 12}" class="row-sub">${state.data.real_world_pct_female[o]}% women (US)</text>`;
    const vs = keys.map((k) => values(k)[o]);
    const lo = Math.min(rm, ...vs), hi = Math.max(rm, ...vs);
    s += `<line x1="${x(lo)}" x2="${x(hi)}" y1="${cy}" y2="${cy}" stroke="${css("--grid")}" stroke-width="2"/>`;
    s += `<line x1="${x(rm)}" x2="${x(rm)}" y1="${cy - 10}" y2="${cy + 10}" class="ref"/>`;
    s += `<rect x="${x(rm) - 6}" y="${cy - 12}" width="12" height="24" class="hit" ${tipAttr(`<b>${esc(o)}</b> · US workforce<br>${pct(rm)} men, ${pct(1 - rm)} women`)}/>`;
    keys.forEach((k, j) => {
      const sr = seriesOf(k), v = values(k)[o], cyy = cy + offs[j];
      const gap = (v - rm) * 100;
      const html = `<b>${esc(sr.short)}</b> · ${esc(o)}<br>${pct(v, 1)} male share<br><span class="t-muted">${gap >= 0 ? "+" : ""}${gap.toFixed(0)} pts vs US workforce</span>`;
      s += shape(sr.shape, x(v), cyy, 5.5, css(sr.color));
      s += `<circle cx="${x(v)}" cy="${cyy}" r="11" class="hit" ${tipAttr(html)}/>`;
    });
  });
  el.innerHTML = s + "</svg>";
}

function renderToggles() {
  const keys = available(TEXT_KEYS);
  $("#seriesToggles").innerHTML = keys.map((k) => {
    const s = seriesOf(k);
    return `<button type="button" class="toggle" data-k="${k}" aria-pressed="${state.visible[k]}">${icon(s)} ${esc(s.short)}</button>`;
  }).join("") + `<span class="toggle" style="border-style:dashed">${refIcon()} US workforce</span>`;
  document.querySelectorAll("#seriesToggles button").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.k, on = keys.filter((x) => state.visible[x]);
    if (state.visible[k] && on.length === 1) return; // keep at least one
    state.visible[k] = !state.visible[k];
    renderToggles(); renderMain();
  }));
}
function renderMain() {
  dotPlot("#dotplot", available(TEXT_KEYS).filter((k) => state.visible[k]));
}

function renderDotTable() {
  const keys = available(SERIES.map((s) => s.key));
  let h = `<div class="tablewrap"><table><thead><tr><th>Occupation</th><th class="num">US workforce, % men</th>${keys.map((k) => `<th class="num">${esc(seriesOf(k).short)}</th>`).join("")}</tr></thead><tbody>`;
  for (const o of sortedOccs()) h += `<tr><td>${esc(o)}</td><td class="num">${pct(realMale(o))}</td>${keys.map((k) => `<td class="num">${pct(values(k)[o], 1)}</td>`).join("")}</tr>`;
  $("#dotTable").innerHTML = h + "</tbody></table></div>";
}

// ---------- scatter small multiples ----------
function renderScatters() {
  const occs = state.data.occupations;
  $("#scatters").innerHTML = available(SERIES.map((s) => s.key)).map((k) => {
    const sr = seriesOf(k), v = values(k);
    const W = 260, H = 240, l = 36, r = 10, t = 10, b = 34, pw = W - l - r, ph = H - t - b;
    const X = (u) => l + u * pw, Y = (u) => t + (1 - u) * ph;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(sr.short)} vs US workforce">`;
    for (const g of [0, 0.5, 1]) {
      s += `<line x1="${X(g)}" x2="${X(g)}" y1="${Y(0)}" y2="${Y(1)}" class="${g === 0.5 ? "midline" : "gridline"}"/>`;
      s += `<line x1="${X(0)}" x2="${X(1)}" y1="${Y(g)}" y2="${Y(g)}" class="${g === 0.5 ? "midline" : "gridline"}"/>`;
      s += `<text x="${X(g)}" y="${H - b + 14}" text-anchor="middle" class="axis-text">${g * 100}%</text>`;
      s += `<text x="${l - 6}" y="${Y(g) + 4}" text-anchor="end" class="axis-text">${g * 100}%</text>`;
    }
    s += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(1)}" y2="${Y(1)}" stroke="${css("--ink-2")}" stroke-width="1"/>`;
    s += `<text x="${X(0.5)}" y="${H - 2}" text-anchor="middle" class="axis-text">US workforce, % men</text>`;
    for (const o of occs) {
      const html = `<b>${esc(o)}</b><br>US: ${pct(realMale(o))} men<br>${esc(sr.short)}: ${pct(v[o], 1)} male`;
      s += shape(sr.shape, X(realMale(o)), Y(v[o]), 5, css(sr.color));
      s += `<circle cx="${X(realMale(o))}" cy="${Y(v[o])}" r="10" class="hit" ${tipAttr(html)}/>`;
    }
    const rr = pearson(occs.map(realMale), occs.map((o) => v[o]));
    return `<div><div class="panel-title">${icon(sr)} ${esc(sr.short)} <span class="panel-meta">r = ${rr.toFixed(2)} · y-axis: model % male</span></div>${s}</svg></div>`;
  }).join("");
}

// ---------- insights ----------
function renderInsights() {
  const occs = state.data.occupations, out = [];
  for (const k of available(SERIES.map((s) => s.key))) {
    const v = values(k), sr = seriesOf(k);
    const sorted = [...occs].sort((a, b) => v[b] - v[a]);
    const amp = occs.filter((o) => {
      const rm = realMale(o);
      return Math.sign(v[o] - 0.5) === Math.sign(rm - 0.5) && Math.abs(v[o] - 0.5) > Math.abs(rm - 0.5);
    });
    out.push(`<b>${esc(sr.short)}</b>: most male-leaning is <b>${esc(sorted[0])}</b> (${pct(v[sorted[0]])}), most female-leaning is <b>${esc(sorted.at(-1))}</b> (${pct(v[sorted.at(-1)])}). It exaggerates the real-world imbalance for ${amp.length} of ${occs.length} jobs${amp.length ? ` (${amp.map(esc).join(", ")})` : ""}.`);
  }
  // template sensitivity
  for (const m of state.data.models) {
    let best = null;
    for (const o of occs) {
      const vs = m.prompts.filter((p) => p.occupation === o).map((p) => p.male_share);
      const spread = Math.max(...vs) - Math.min(...vs);
      if (!best || spread > best.spread) best = { o, spread, lo: Math.min(...vs), hi: Math.max(...vs) };
    }
    out.push(`<b>${esc(seriesOf(m.model).short)}</b> is most sensitive to wording for <b>${esc(best.o)}</b>: the 5 templates range from ${pct(best.lo)} to ${pct(best.hi)} male.`);
  }
  $("#insights").innerHTML = out.map((x) => `<li>${x}</li>`).join("");
}

// ---------- heatmaps ----------
function renderHeatmaps() {
  $("#divLegend").innerHTML = `<span>leans female</span><span class="bar" style="background:linear-gradient(90deg, ${css("--div-f")}, ${css("--div-mid")}, ${css("--div-m")})"></span><span>leans male</span><span class="t-muted">· grey = 50/50</span>`;
  const tpls = state.data.templates, occs = sortedOccs();
  $("#heatmaps").innerHTML = state.data.models.map((m) => {
    const sr = seriesOf(m.model), l = 96, t = 22, cw = 44, ch = 24, W = l + tpls.length * cw, H = t + occs.length * ch;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(sr.short)} prompt heatmap">`;
    tpls.forEach((tp, j) => {
      s += `<text x="${l + j * cw + cw / 2}" y="14" text-anchor="middle" class="axis-text" ${tipAttr(esc(m.kind === "causal" ? tp.causal : tp.masked))}>${tp.id}</text>`;
    });
    occs.forEach((o, i) => {
      s += `<text x="${l - 8}" y="${t + i * ch + ch / 2 + 4}" text-anchor="end" class="row-label" style="font-size:12px">${esc(o)}</text>`;
      tpls.forEach((tp, j) => {
        const p = m.prompts.find((r) => r.occupation === o && r.template === tp.id);
        const top = p.top.slice(0, 5).map((x) => `${esc(x.token.trim() || "␣")} ${pct(x.p)}`).join(", ");
        const html = `<b>${esc(p.prompt)}</b><br>Male share ${pct(p.male_share, 1)}<br><span class="t-muted">P(he/his/him) ${pct(p.p_male, 1)} · P(she/her/hers) ${pct(p.p_female, 1)} · P(they) ${pct(p.p_neutral, 1)}<br>Top: ${top}</span>`;
        s += `<rect x="${l + j * cw + 1}" y="${t + i * ch + 1}" width="${cw - 2}" height="${ch - 2}" rx="3" fill="${divColor(p.male_share)}" ${tipAttr(html)}/>`;
      });
    });
    return `<div><div class="panel-title">${icon(sr)} ${esc(m.label)}</div>${s}</svg></div>`;
  }).join("");
}

function downloadCsv() {
  const rows = [["model", "occupation", "template", "prompt", "p_male", "p_female", "p_neutral", "male_share"]];
  for (const m of state.data.models) for (const p of m.prompts)
    rows.push([m.model, p.occupation, p.template, p.prompt, p.p_male, p.p_female, p.p_neutral, p.male_share]);
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "bias_probe_results.csv"; a.click();
}

// ---------- images ----------
function renderImages() {
  const im = state.data.images;
  if (!im) { $("#imgSub").textContent = "No image results yet. Run: python -m probe.image_probe"; return; }
  const n = im.images.length / state.data.occupations.length;
  $("#imgSub").textContent = `${n} images per job from “${im.images[0].prompt.replace(state.data.occupations[0], "{occupation}")}”, same seeds for every job. The marker is CLIP’s average probability that the image shows a man.`;
  dotPlot("#imgChart", ["image"]);
  $("#gallery").innerHTML = sortedOccs().map((o) => {
    const b = im.by_occupation[o], imgs = im.images.filter((x) => x.occupation === o);
    return `<div class="g-row"><div class="occ">${esc(o)}<span>CLIP: ${b.n_male} men, ${b.n_female} women</span></div><div class="thumbs">${imgs.map((x) =>
      `<figure class="thumb"><img src="/results/${esc(x.file)}" alt="${esc(o)}, seed ${x.seed}" loading="lazy"><figcaption>${x.p_male > 0.5 ? "man " + pct(x.p_male) : "woman " + pct(x.p_female)}</figcaption></figure>`).join("")}</div></div>`;
  }).join("");
}

// ---------- live probe ----------
const EXAMPLES = ["pilot", "CEO", "nanny", "chef", "scientist", "soldier", "cashier", "surgeon", "dancer", "plumber"];
$("#exampleChips").innerHTML = EXAMPLES.map((e) => `<button type="button" class="chip">${e}</button>`).join("");
document.querySelectorAll("#exampleChips .chip").forEach((c) => c.addEventListener("click", () => {
  $("#occIn").value = c.textContent; $("#promptIn").value = ""; $("#probeForm").requestSubmit();
}));
$("#probeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter || $("#probeForm button");
  btn.disabled = true; $("#liveOut").innerHTML = `<p class="note">Running models…</p>`;
  try {
    const r = await fetch("/api/probe", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ occupation: $("#occIn").value, prompt: $("#promptIn").value }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || r.statusText);
    $("#liveOut").innerHTML = d.models.map((m) => {
      const sr = seriesOf(m.model);
      return `<div class="live-model"><h3>${icon(sr)} ${esc(m.label)} <span class="panel-meta">avg male share ${pct(m.male_share, 1)}</span></h3>
      <div class="tablewrap"><table><thead><tr><th>Prompt</th><th>Lean</th><th class="num">Male share</th><th>Top next words</th></tr></thead><tbody>${m.rows.map((p) =>
        `<tr><td>${esc(p.prompt)}</td><td><div class="sharebar" aria-hidden="true"><i style="left:calc(${p.male_share * 100}% - 1.5px)"></i></div></td><td class="num">${pct(p.male_share, 1)}</td><td class="toks">${p.top.map((t) => `${esc(t.token.trim() || "␣")} ${pct(t.p)}`).join(", ")}</td></tr>`).join("")}</tbody></table></div></div>`;
    }).join("");
  } catch (err) {
    $("#liveOut").innerHTML = `<p class="err">Probe failed: ${esc(err.message)}</p>`;
  } finally { btn.disabled = false; }
});

// ---------- boot ----------
function renderAll() {
  if (!state.data) return;
  renderKpis(); renderToggles(); renderMain(); renderDotTable(); renderScatters();
  renderInsights(); renderHeatmaps(); renderImages();
}
let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(renderAll, 150); });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAll);

// Only one of the two live-probe inputs is used, so typing in one clears the other.
$("#occIn").addEventListener("input", () => { $("#promptIn").value = ""; });
$("#promptIn").addEventListener("input", () => { $("#occIn").value = ""; });

let firstLoad = true;
function loadResults() {
  fetch("/api/results").then((r) => r.json()).then((d) => {
    const complete = d.images && d.models.length >= 3;
    // While probes are still running, re-check every 20 s and redraw when new results appear.
    if (!complete) setTimeout(loadResults, 20000);
    if (!firstLoad && JSON.stringify(d.models.map((m) => m.model)) === JSON.stringify(state.data.models.map((m) => m.model)) && !!d.images === !!state.data.images) return;
    state.data = d;
    if (firstLoad) {
      firstLoad = false;
      $("#loading").hidden = true;
      document.querySelectorAll("main section").forEach((s) => (s.hidden = false));
      $("#tplList").textContent = d.templates.map((t) => t.causal.replace("{occ}", "___") + " …").join("  ·  ");
    }
    if (!d.models.length) { $("#overview").innerHTML = `<p class="note">No results yet. Run <code>python -m probe.text_probe</code> first.</p>`; return; }
    renderAll();
  }).catch((e) => { if (firstLoad) $("#loading").textContent = "Could not load results: " + e.message; });
}
loadResults();
