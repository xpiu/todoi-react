// iconHint: grid-fits a 24-unit line icon (Lucide node list) to one pixel size, the way a font hinter fits a glyph to its ppem.
// Why: scaled to 14 / 16px with a ~1px stroke, an icon's straight rules, curve tops and corners land between pixels and antialias to
// two half-covered pixels, so the glyph reads grey and soft on dark paper. Here every horizontal / vertical rule, every curve extreme,
// every corner and line end is moved (by at most half a pixel) onto a pixel centre; the points in between follow linearly.
// Offsets are rounded from the icon's centre (12), so a symmetric glyph stays symmetric.
// Output is still in 24-unit coordinates for a "0 0 24 24" viewBox, so CSS width / height / stroke-width rules apply unchanged.
// Used by Icon under the Minimal theme only. Pure: no DOM, no React.
// Ported verbatim from Claude Design (components/core/iconHint.jsx); keep the two in step.

export type IconNodeTag = "path" | "circle" | "rect" | "ellipse" | "line" | "polyline" | "polygon";
export type IconNodeAttrs = Record<string, string | number>;
export type IconNode = [tag: IconNodeTag, attrs: IconNodeAttrs];

type Seg = { t: "L" | "C"; p: number[]; a?: [number, number]; ti?: [number, number]; to?: [number, number]; smooth?: boolean };
type Sub = { closed: boolean; x: number; y: number; segs: Seg[]; box?: [number, number, number, number]; dot?: boolean };
type Part = { n: IconNode; ell?: number[]; rect?: number[]; dot?: boolean; subs?: Sub[] };

const EPS = 1e-4,
  GEOM: Record<string, 1> = { d: 1, cx: 1, cy: 1, r: 1, rx: 1, ry: 1, x: 1, y: 1, width: 1, height: 1, x1: 1, y1: 1, x2: 1, y2: 1, points: 1, key: 1 };
const rnd = (x: number) => (x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5));
const centre = (px: number, g: number) => Math.floor(px / 2 - g + 0.5) + g;
function arcToCubics(x0: number, y0: number, rx: number, ry: number, rot: number, fa: number, fs: number, x: number, y: number): number[][] | null {
  if (Math.abs(x0 - x) < EPS && Math.abs(y0 - y) < EPS) return [];
  rx = Math.abs(rx); ry = Math.abs(ry); if (rx < EPS || ry < EPS) return null;
  const phi = (rot * Math.PI) / 180, sp = Math.sin(phi), cp = Math.cos(phi), dx = (x0 - x) / 2, dy = (y0 - y) / 2, xp = cp * dx + sp * dy, yp = -sp * dx + cp * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry); if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const den = rx * rx * yp * yp + ry * ry * xp * xp; let co = den < EPS ? 0 : Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / den)); if (fa === fs) co = -co;
  const cxp = (co * rx * yp) / ry, cyp = (-co * ry * xp) / rx, cx = cp * cxp - sp * cyp + (x0 + x) / 2, cy = sp * cxp + cp * cyp + (y0 + y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (xp - cxp) / rx, uy = (yp - cyp) / ry, th = ang(1, 0, ux, uy); let dth = ang(ux, uy, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!fs && dth > 0) dth -= 2 * Math.PI; else if (fs && dth < 0) dth += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-6)), d = dth / n, t = (4 / 3) * Math.tan(d / 4), out: number[][] = [];
  const pt = (c: number, s: number) => [cx + rx * c * cp - ry * s * sp, cy + rx * c * sp + ry * s * cp] as const;
  for (let i = 0; i < n; i++) { const a = th + i * d, b = a + d, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), e1 = pt(ca - t * sa, sa + t * ca), e2 = pt(cb + t * sb, sb - t * cb), e = pt(cb, sb); out.push([e1[0], e1[1], e2[0], e2[1], e[0], e[1]]); }
  out[n - 1]![4] = x; out[n - 1]![5] = y; return out;
}
// d → subpaths [{closed,x,y,segs:[{t:"L",p:[x,y]}|{t:"C",p:[x1,y1,x2,y2,x,y]}]}], absolute.
function parsePath(d: string): Sub[] {
  const subs: Sub[] = [], n = d.length; let i = 0, cmd = "", cx = 0, cy = 0, cur: Sub | null = null, lc: number[] | null = null, lq: number[] | null = null;
  const ws = () => { while (i < n && (d[i] === " " || d[i] === "," || d[i] === "\n" || d[i] === "\t")) i++; };
  const num = () => { ws(); const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(d.slice(i, i + 32)); if (!m) { i = n; return 0; } i += m[0].length; return +m[0]; };
  const flag = () => { ws(); return d[i++] === "1" ? 1 : 0; };
  const open = (): Sub => { if (!cur) { cur = { closed: false, x: cx, y: cy, segs: [] }; subs.push(cur); } return cur; };
  const line = (x: number, y: number) => { open().segs.push({ t: "L", p: [x, y] }); cx = x; cy = y; lc = lq = null; };
  const cub = (a: number, b: number, c: number, e: number, x: number, y: number) => { open().segs.push({ t: "C", p: [a, b, c, e, x, y] }); cx = x; cy = y; };
  for (;;) {
    ws(); if (i >= n) break;
    if (/[a-zA-Z]/.test(d[i]!)) { cmd = d[i++]!; if (cmd === "Z" || cmd === "z") { if (cur) { const s: Sub = cur; if (Math.hypot(cx - s.x, cy - s.y) > EPS) s.segs.push({ t: "L", p: [s.x, s.y] }); s.closed = true; cx = s.x; cy = s.y; cur = null; } lc = lq = null; continue; } }
    else if (!cmd) break;
    const rel = cmd >= "a", C = cmd.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === "M") { cx = num() + ox; cy = num() + oy; cur = null; open(); cmd = rel ? "l" : "L"; lc = lq = null; }
    else if (C === "L") { line(num() + ox, num() + oy); }
    else if (C === "H") { line(num() + ox, cy); }
    else if (C === "V") { line(cx, num() + oy); }
    else if (C === "C") { const a = num() + ox, b = num() + oy, c = num() + ox, e = num() + oy, x = num() + ox, y = num() + oy; cub(a, b, c, e, x, y); lc = [c, e]; lq = null; }
    else if (C === "S") { const pc: number[] | null = lc, a = pc ? 2 * cx - pc[0]! : cx, b = pc ? 2 * cy - pc[1]! : cy, c = num() + ox, e = num() + oy, x = num() + ox, y = num() + oy; cub(a, b, c, e, x, y); lc = [c, e]; lq = null; }
    else if (C === "Q" || C === "T") { let qx: number, qy: number; const pq: number[] | null = lq; if (C === "Q") { qx = num() + ox; qy = num() + oy; } else { qx = pq ? 2 * cx - pq[0]! : cx; qy = pq ? 2 * cy - pq[1]! : cy; } const x = num() + ox, y = num() + oy, sx = cx, sy = cy; cub(sx + (2 / 3) * (qx - sx), sy + (2 / 3) * (qy - sy), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y); lq = [qx, qy]; lc = null; }
    else if (C === "A") { const rx = num(), ry = num(), rot = num(), fa = flag(), fs = flag(), x = num() + ox, y = num() + oy, cs = arcToCubics(cx, cy, rx, ry, rot, fa, fs, x, y); if (cs === null) line(x, y); else cs.forEach((c) => cub(c[0]!, c[1]!, c[2]!, c[3]!, c[4]!, c[5]!)); lc = lq = null; }
    else break;
  }
  return subs;
}
function nodePath(tag: string, a: IconNodeAttrs): string | null {
  const f = (k: string) => +a[k]! || 0;
  if (tag === "path") return String(a.d || "");
  if (tag === "circle" || tag === "ellipse") { const cx = f("cx"), cy = f("cy"), rx = tag === "circle" ? f("r") : f("rx"), ry = tag === "circle" ? f("r") : f("ry"); return `M${cx + rx} ${cy}A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}Z`; }
  if (tag === "rect") {
    const x = f("x"), y = f("y"), w = f("width"), h = f("height"); let rx = a.rx != null ? f("rx") : f("ry"), ry = a.ry != null ? f("ry") : rx; rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
    if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
  }
  if (tag === "line") return `M${f("x1")} ${f("y1")}L${f("x2")} ${f("y2")}`;
  if (tag === "polyline" || tag === "polygon") { const p = String(a.points || "").trim().split(/[\s,]+/).map(Number), o: string[] = []; for (let i = 0; i + 1 < p.length; i += 2) o.push((i ? "L" : "M") + p[i] + " " + p[i + 1]); return o.join("") + (tag === "polygon" ? "Z" : ""); }
  return null;
}
// Split each cubic at its x / y extremes, so every curve top, bottom and side is an on-curve point that can be snapped.
function splitExtrema(sub: Sub) {
  const out: Seg[] = []; let px = sub.x, py = sub.y;
  for (const s of sub.segs) {
    if (s.t === "L") { out.push(s); px = s.p[0]!; py = s.p[1]!; continue; }
    const P = [px, py, ...s.p], ts: number[] = [];
    for (const o of [0, 1]) { const p0 = P[o]!, p1 = P[2 + o]!, p2 = P[4 + o]!, p3 = P[6 + o]!, a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;
      if (Math.abs(a) < 1e-9) { if (Math.abs(b) > 1e-9) ts.push(-c / b); } else { const q = b * b - 4 * a * c; if (q >= 0) { const r = Math.sqrt(q); ts.push((-b + r) / (2 * a), (-b - r) / (2 * a)); } } }
    const cut = ts.filter((t) => t > 0.03 && t < 0.97).sort((x, y) => x - y).filter((t, i, l) => !i || t - l[i - 1]! > 0.03);
    let Q = P, t0 = 0;
    for (const t of cut) { const u = (t - t0) / (1 - t0), L = (a: number, b: number) => a + (b - a) * u, x01 = L(Q[0]!, Q[2]!), y01 = L(Q[1]!, Q[3]!), x12 = L(Q[2]!, Q[4]!), y12 = L(Q[3]!, Q[5]!), x23 = L(Q[4]!, Q[6]!), y23 = L(Q[5]!, Q[7]!), xa = L(x01, x12), ya = L(y01, y12), xb = L(x12, x23), yb = L(y12, y23), xm = L(xa, xb), ym = L(ya, yb);
      out.push({ t: "C", p: [x01, y01, xa, ya, xm, ym] }); Q = [xm, ym, xb, yb, x23, y23, Q[6]!, Q[7]!]; t0 = t; }
    out.push({ t: "C", p: Q.slice(2) }); px = s.p[4]!; py = s.p[5]!;
  }
  sub.segs = out;
}
const first = (...v: number[]): [number, number] => { for (let i = 0; i < v.length; i += 2) if (Math.hypot(v[i]!, v[i + 1]!) > EPS) return [v[i]!, v[i + 1]!]; return [0, 0]; };
/** nodes: Lucide icon nodes ([tag, attrs][]); px: rendered size in CSS px; sw: stroke width in CSS px. Returns nodes for a 0 0 24 24 viewBox. */
export function hintIcon(nodes: readonly IconNode[], px: number, sw: number): IconNode[] {
  const u = px / 24, g = Math.max(1, Math.round(sw)) % 2 ? 0.5 : 0, c = centre(px, g), X: number[] = [], Y: number[] = [], parts: Part[] = [];
  // A dot (bullet, tittle, tiny dash) is moved as one piece, not warped: onto a pixel centre when its outer size is about 1 or 3px, onto a pixel corner when about 2px (a 2.2px bullet then fills a 2×2 block).
  const dim = (lo: number, hi: number) => { const D = Math.max(1, Math.round((hi - lo) * u + sw - 0.2)), mid = (lo + hi) / 2, t = (centre(px, D % 2 ? 0.5 : 0) + rnd((mid - 12) * u)) / u; return (v: number) => t + v - mid; };
  for (const n of nodes) {
    const a = n[1] || {}, tag = n[0], open = !(a.fill && a.fill !== "none"), f = (k: string) => +a[k]! || 0;
    // Circles, ellipses and rects stay what they are (only their four edges are fitted): a small circle redrawn as curves loses half its ink in the rasteriser, and a ring stays round.
    if (open && (tag === "circle" || tag === "ellipse")) { const cx = f("cx"), cy = f("cy"), rx = tag === "circle" ? f("r") : f("rx"), ry = tag === "circle" ? f("r") : f("ry"), dot = Math.max(rx, ry) * 2 * u <= 2; if (!dot) { X.push(cx - rx, cx + rx); Y.push(cy - ry, cy + ry); } parts.push({ n, ell: [cx - rx, cx + rx, cy - ry, cy + ry], dot }); continue; }
    if (open && tag === "rect" && Math.max(f("width"), f("height")) * u > 2) { const x = f("x"), y = f("y"), w = f("width"), h = f("height"); X.push(x, x + w); Y.push(y, y + h); parts.push({ n, rect: [x, x + w, y, y + h] }); continue; }
    const d = open ? nodePath(tag, a) : null; if (d == null) { parts.push({ n }); continue; }
    const subs = parsePath(d).filter((s) => s.segs.length); subs.forEach(splitExtrema); parts.push({ n, subs });
    for (const s of subs) {
      // absolute start / end and tangents per segment
      let x = s.x, y = s.y, x0 = x, x1 = x, y0 = y, y1 = y;
      for (const q of s.segs) { const p = q.p, ex = p[p.length - 2]!, ey = p[p.length - 1]!; q.a = [x, y];
        if (q.t === "L") { q.ti = q.to = first(ex - x, ey - y); } else { q.ti = first(p[0]! - x, p[1]! - y, p[2]! - x, p[3]! - y, ex - x, ey - y); q.to = first(ex - p[2]!, ey - p[3]!, ex - p[0]!, ey - p[1]!, ex - x, ey - y); }
        x = ex; y = ey; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      s.box = [x0, y0, x1, y1];
      if (Math.max(x1 - x0, y1 - y0) * u <= 2) { s.dot = true; continue; }
      const m = s.segs.length;
      for (let i = 0; i < m; i++) { const q = s.segs[i]!, p = q.p, ex = p[p.length - 2]!, ey = p[p.length - 1]!, ti = q.ti!, to = q.to!, qa = q.a!;
        const flat = (t: number[]) => Math.abs(t[1]!) <= 0.02 * Math.hypot(t[0]!, t[1]!), up = (t: number[]) => Math.abs(t[0]!) <= 0.02 * Math.hypot(t[0]!, t[1]!);
        if (Math.hypot(ti[0], ti[1]) > EPS) { if (flat(ti)) Y.push(qa[1]); if (up(ti)) X.push(qa[0]); }
        if (Math.hypot(to[0], to[1]) > EPS) { if (flat(to)) Y.push(ey); if (up(to)) X.push(ex); }
        // corner or free end → both axes
        const nx = i + 1 < m ? s.segs[i + 1]! : s.closed && Math.hypot(ex - s.x, ey - s.y) < EPS ? s.segs[0]! : null;
        if (!nx) { if (!s.closed || Math.hypot(ex - s.x, ey - s.y) > EPS) { X.push(ex); Y.push(ey); } }
        else { const a1 = to, a2 = nx.ti!, l = Math.hypot(a1[0], a1[1]) * Math.hypot(a2[0], a2[1]); q.smooth = l > EPS && (a1[0] * a2[0] + a1[1] * a2[1]) / l > 0.999; if (!q.smooth) { X.push(ex); Y.push(ey); } } }
      if (!s.closed || Math.hypot(x - s.x, y - s.y) > EPS) { X.push(s.x); Y.push(s.y); }
    }
  }
  const axis = (V: number[]) => { const B = [...V].sort((a, b) => a - b).filter((v, i, l) => !i || v - l[i - 1]! > 0.05), T = B.map((v) => (c + rnd((v - 12) * u)) / u), k = B.length;
    return (v: number) => { if (!k) return v + (c - px / 2) / u; if (v <= B[0]!) return v + T[0]! - B[0]!; if (v >= B[k - 1]!) return v + T[k - 1]! - B[k - 1]!; let i = 1; while (B[i]! < v) i++; return T[i - 1]! + ((v - B[i - 1]!) * (T[i]! - T[i - 1]!)) / (B[i]! - B[i - 1]!); }; };
  const fx = axis(X), fy = axis(Y), r3 = (v: number) => +v.toFixed(3), out: IconNode[] = [];
  const rest = (a: IconNodeAttrs) => { const o: IconNodeAttrs = {}; for (const k in a) if (!GEOM[k]) o[k] = a[k]!; return o; };
  for (const part of parts) {
    if (part.ell || part.rect) { const b = (part.ell || part.rect)!, mx = part.dot ? dim(b[0]!, b[1]!) : fx, my = part.dot ? dim(b[2]!, b[3]!) : fy, l = mx(b[0]!), r = mx(b[1]!), t = my(b[2]!), e = my(b[3]!), o = rest(part.n[1]);
      if (part.rect) { o.x = r3(l); o.y = r3(t); o.width = r3(r - l); o.height = r3(e - t); for (const k of ["rx", "ry"]) if (part.n[1][k] != null) o[k] = part.n[1][k]!; out.push(["rect", o]); }
      else if (Math.abs(r - l - e + t) < 0.004) { o.cx = r3((l + r) / 2); o.cy = r3((t + e) / 2); o.r = r3((r - l) / 2); out.push(["circle", o]); }
      else { o.cx = r3((l + r) / 2); o.cy = r3((t + e) / 2); o.rx = r3((r - l) / 2); o.ry = r3((e - t) / 2); out.push(["ellipse", o]); }
      continue; }
    if (!part.subs) { out.push(part.n); continue; } let d = "";
    for (const s of part.subs) { let mx: (v: number) => number, my: (v: number) => number;
      if (s.dot) { const b = s.box!; mx = dim(b[0], b[2]); my = dim(b[1], b[3]); }
      else { mx = fx; my = fy; }
      const segs = s.segs.map((q) => ({ t: q.t, smooth: q.smooth, p: q.p.map((v, i) => (i % 2 ? my(v) : mx(v))) })); const sx = mx(s.x), sy = my(s.y);
      // A smooth join whose two handles were scaled differently by the warp is straightened again (it would show as a kink).
      if (!s.dot) for (let i = 0; i < segs.length; i++) { const q = segs[i]!; if (!q.smooth) continue; const nx = segs[(i + 1) % segs.length]!, p = q.p, ex = p[p.length - 2]!, ey = p[p.length - 1]!;
        const h1 = q.t === "C" ? [ex - p[2]!, ey - p[3]!] : null, h2 = nx.t === "C" ? [nx.p[0]! - ex, nx.p[1]! - ey] : null, l1 = h1 ? Math.hypot(h1[0]!, h1[1]!) : 0, l2 = h2 ? Math.hypot(h2[0]!, h2[1]!) : 0;
        let dx: number, dy: number;
        if (h1 && h2 && l1 > EPS && l2 > EPS) { dx = h1[0]! / l1 + h2[0]! / l2; dy = h1[1]! / l1 + h2[1]! / l2; }
        else if (h1 && l1 > EPS && nx.t === "L") { dx = nx.p[0]! - ex; dy = nx.p[1]! - ey; }
        else if (h2 && l2 > EPS && q.t === "L") { const pp = i ? segs[i - 1]!.p : null, ax = pp ? pp[pp.length - 2]! : sx, ay = pp ? pp[pp.length - 1]! : sy; dx = ex - ax; dy = ey - ay; }
        else continue;
        const l = Math.hypot(dx, dy); if (l < EPS) continue; dx /= l; dy /= l;
        if (h1 && l1 > EPS) { p[2] = ex - dx * l1; p[3] = ey - dy * l1; } if (h2 && l2 > EPS) { nx.p[0] = ex + dx * l2; nx.p[1] = ey + dy * l2; } }
      d += "M" + r3(sx) + " " + r3(sy); for (const q of segs) d += q.t + q.p.map(r3).join(" "); if (s.closed) d += "Z"; }
    const attrs = rest(part.n[1]); attrs.d = d; out.push(["path", attrs]);
  }
  return out;
}
