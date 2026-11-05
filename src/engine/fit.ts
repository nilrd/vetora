import type { Curve, Seg, Point } from './types.ts'

export interface FitOptions {
  /** erro máximo da curva em px */
  tolerance: number
  /** ângulo (graus) acima do qual vira canto */
  cornerAngle: number
  /** suavização dos pontos (0..1) para imagens sem antialiasing */
  smooth: number
  /** tenta formas inteiras (círculo) */
  primitives: boolean
}

type P = { x: number; y: number }

function toPts(a: Float64Array): P[] {
  const r: P[] = []
  for (let i = 0; i < a.length; i += 2) r.push({ x: a[i], y: a[i + 1] })
  return r
}

/** Suavização de Taubin (não encolhe a forma). Pontos travados não se movem. */
function taubin(p: P[], closed: boolean, locked: Uint8Array, iters: number, lambda = 0.5, mu = -0.53) {
  const n = p.length
  if (n < 4) return
  const tmp = p.map((q) => ({ x: q.x, y: q.y }))
  for (let it = 0; it < iters; it++)
    for (const f of [lambda, mu]) {
      for (let i = 0; i < n; i++) {
        if (locked[i]) { tmp[i].x = p[i].x; tmp[i].y = p[i].y; continue }
        const a = closed ? p[(i - 1 + n) % n] : p[Math.max(0, i - 1)]
        const b = closed ? p[(i + 1) % n] : p[Math.min(n - 1, i + 1)]
        tmp[i].x = p[i].x + f * ((a.x + b.x) / 2 - p[i].x)
        tmp[i].y = p[i].y + f * ((a.y + b.y) / 2 - p[i].y)
      }
      for (let i = 0; i < n; i++) { p[i].x = tmp[i].x; p[i].y = tmp[i].y }
    }
}

function findCorners(p: P[], closed: boolean, angleDeg: number): number[] {
  const n = p.length
  const out: number[] = []
  if (n < 5) return out
  const k = 2
  const K2 = 5
  const thr = (angleDeg * Math.PI) / 180
  const angAt = (i: number, kk: number) => {
    if (!closed && (i < kk || i >= n - kk)) return -1
    if (closed && n < kk * 2 + 2) return -1
    const a = p[(i - kk + n) % n], b = p[i], c = p[(i + kk) % n]
    const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy)
    if (lu < 1e-9 || lv < 1e-9) return 0
    const cos = (ux * vx + uy * vy) / (lu * lv)
    return Math.acos(Math.max(-1, Math.min(1, cos)))
  }
  const ang = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const a1 = angAt(i, k)
    if (a1 < thr) continue
    // canto de verdade aparece também numa escala maior; degrau de escada, não
    const a2 = angAt(i, K2)
    if (a2 >= 0 && a2 < thr * 0.6) continue
    ang[i] = a1
  }
  for (let i = 0; i < n; i++) {
    if (ang[i] < thr) continue
    let isMax = true
    for (let j = -k; j <= k; j++) {
      if (!j) continue
      const q = closed ? (i + j + n) % n : i + j
      if (q < 0 || q >= n) continue
      if (ang[q] > ang[i] || (ang[q] === ang[i] && j < 0)) { isMax = false; break }
    }
    if (isMax) out.push(i)
  }
  return out
}

/** Ajusta uma reta (mínimos quadrados) e devolve ponto + direção. */
function fitLine(pts: P[]): { cx: number; cy: number; dx: number; dy: number; rms: number } | null {
  const n = pts.length
  if (n < 2) return null
  let cx = 0, cy = 0
  for (const q of pts) { cx += q.x; cy += q.y }
  cx /= n; cy /= n
  let sxx = 0, syy = 0, sxy = 0
  for (const q of pts) { const dx = q.x - cx, dy = q.y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const dx = Math.cos(th), dy = Math.sin(th)
  let e = 0
  for (const q of pts) { const d = (q.x - cx) * -dy + (q.y - cy) * dx; e += d * d }
  return { cx, cy, dx, dy, rms: Math.sqrt(e / n) }
}

/** Em cada canto, coloca o vértice na interseção das duas retas vizinhas (canto vivo de verdade). */
function sharpenCorner(p: P[], i: number, closed: boolean): P | null {
  const n = p.length
  const get = (j: number) => (closed ? p[(j + n) % n] : p[Math.max(0, Math.min(n - 1, j))])
  const before: P[] = [], after: P[] = []
  for (let j = 2; j <= 5; j++) { before.push(get(i - j)); after.push(get(i + j)) }
  if (!closed && (i - 5 < 0 || i + 5 >= n)) return null
  const a = fitLine(before), b = fitLine(after)
  if (!a || !b || a.rms > 0.35 || b.rms > 0.35) return null
  const den = a.dx * b.dy - a.dy * b.dx
  if (Math.abs(den) < 0.2) return null
  const t = ((b.cx - a.cx) * b.dy - (b.cy - a.cy) * b.dx) / den
  const q = { x: a.cx + a.dx * t, y: a.cy + a.dy * t }
  if (Math.hypot(q.x - p[i].x, q.y - p[i].y) > 1.6) return null
  return q
}

// ---------- Ajuste de Bézier (Schneider) ----------

function sub(a: P, b: P): P { return { x: a.x - b.x, y: a.y - b.y } }
function add(a: P, b: P): P { return { x: a.x + b.x, y: a.y + b.y } }
function mul(a: P, s: number): P { return { x: a.x * s, y: a.y * s } }
function dot(a: P, b: P) { return a.x * b.x + a.y * b.y }
function norm(a: P): P { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l } }

function bez(b: P[], t: number): P {
  const mt = 1 - t
  return {
    x: mt * mt * mt * b[0].x + 3 * mt * mt * t * b[1].x + 3 * mt * t * t * b[2].x + t * t * t * b[3].x,
    y: mt * mt * mt * b[0].y + 3 * mt * mt * t * b[1].y + 3 * mt * t * t * b[2].y + t * t * t * b[3].y,
  }
}

function chordParam(p: P[], first: number, last: number) {
  const u = [0]
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y))
  const L = u[u.length - 1] || 1
  return u.map((v) => v / L)
}

function generate(p: P[], first: number, last: number, u: number[], t1: P, t2: P): P[] {
  const n = last - first + 1
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0
  const p0 = p[first], p3 = p[last]
  for (let i = 0; i < n; i++) {
    const t = u[i], mt = 1 - t
    const b0 = mt * mt * mt, b1 = 3 * mt * mt * t, b2 = 3 * mt * t * t, b3 = t * t * t
    const a1 = mul(t1, b1), a2 = mul(t2, b2)
    c00 += dot(a1, a1); c01 += dot(a1, a2); c11 += dot(a2, a2)
    const tmp = sub(p[first + i], add(mul(p0, b0 + b1), mul(p3, b2 + b3)))
    x0 += dot(a1, tmp); x1 += dot(a2, tmp)
  }
  const det = c00 * c11 - c01 * c01
  const seg = Math.hypot(p3.x - p0.x, p3.y - p0.y)
  let al = 0, ar = 0
  if (Math.abs(det) > 1e-12) { al = (x0 * c11 - x1 * c01) / det; ar = (c00 * x1 - c01 * x0) / det }
  const eps = 1e-6 * seg
  if (al < eps || ar < eps || al > seg * 2 || ar > seg * 2) { al = ar = seg / 3 }
  return [p0, add(p0, mul(t1, al)), add(p3, mul(t2, ar)), p3]
}

function maxError(p: P[], first: number, last: number, b: P[], u: number[]) {
  let maxD = 0, split = Math.floor((first + last) / 2)
  for (let i = first + 1; i < last; i++) {
    const q = bez(b, u[i - first])
    const d = (q.x - p[i].x) ** 2 + (q.y - p[i].y) ** 2
    if (d >= maxD) { maxD = d; split = i }
  }
  return { maxD, split }
}

function reparam(p: P[], first: number, last: number, u: number[], b: P[]) {
  const d1 = [mul(sub(b[1], b[0]), 3), mul(sub(b[2], b[1]), 3), mul(sub(b[3], b[2]), 3)]
  const d2 = [mul(sub(d1[1], d1[0]), 2), mul(sub(d1[2], d1[1]), 2)]
  return u.map((t, k) => {
    const q = bez(b, t)
    const mt = 1 - t
    const q1 = { x: mt * mt * d1[0].x + 2 * mt * t * d1[1].x + t * t * d1[2].x, y: mt * mt * d1[0].y + 2 * mt * t * d1[1].y + t * t * d1[2].y }
    const q2 = { x: mt * d2[0].x + t * d2[1].x, y: mt * d2[0].y + t * d2[1].y }
    const diff = sub(q, p[first + k])
    const num = dot(diff, q1), den = dot(q1, q1) + dot(diff, q2)
    if (Math.abs(den) < 1e-12) return t
    const r = t - num / den
    return r < 0 ? 0 : r > 1 ? 1 : r
  })
}

function fitCubic(p: P[], first: number, last: number, t1: P, t2: P, err: number, out: Seg[], depth = 0) {
  const n = last - first + 1
  if (n === 2) {
    out.push({ t: 'L', x: p[last].x, y: p[last].y })
    return
  }
  // reta?
  const a = p[first], b = p[last]
  const L = Math.hypot(b.x - a.x, b.y - a.y)
  if (L > 1e-9) {
    let md = 0
    for (let i = first + 1; i < last; i++) {
      const d = Math.abs((p[i].x - a.x) * (b.y - a.y) - (p[i].y - a.y) * (b.x - a.x)) / L
      if (d > md) md = d
    }
    if (md < Math.min(err, 0.3)) { out.push({ t: 'L', x: b.x, y: b.y }); return }
  }
  let u = chordParam(p, first, last)
  let bz = generate(p, first, last, u, t1, t2)
  let { maxD, split } = maxError(p, first, last, bz, u)
  const e2 = err * err
  if (maxD < e2) { pushC(bz, out); return }
  if (maxD < e2 * 9) {
    for (let it = 0; it < 6; it++) {
      u = reparam(p, first, last, u, bz)
      bz = generate(p, first, last, u, t1, t2)
      ;({ maxD, split } = maxError(p, first, last, bz, u))
      if (maxD < e2) { pushC(bz, out); return }
    }
  }
  if (depth > 40 || split <= first || split >= last) { pushC(bz, out); return }
  const tc = norm(sub(p[Math.min(last, split + 1)], p[Math.max(first, split - 1)]))
  fitCubic(p, first, split, t1, mul(tc, -1), err, out, depth + 1)
  fitCubic(p, split, last, tc, t2, err, out, depth + 1)
}

function pushC(b: P[], out: Seg[]) {
  out.push({ t: 'C', x1: b[1].x, y1: b[1].y, x2: b[2].x, y2: b[2].y, x: b[3].x, y: b[3].y })
}

function tangentAt(p: P[], i: number, dir: 1 | -1, last: number, first: number) {
  // direção média dos próximos pontos (mais estável que só o vizinho)
  const k = Math.min(3, dir > 0 ? last - i : i - first)
  if (k < 1) return { x: 1, y: 0 }
  return norm(sub(p[i + dir * k], p[i]))
}

function fitRun(p: P[], first: number, last: number, err: number, out: Seg[]) {
  if (last - first < 1) return
  if (last - first === 1) { out.push({ t: 'L', x: p[last].x, y: p[last].y }); return }
  const t1 = tangentAt(p, first, 1, last, first)
  const t2 = tangentAt(p, last, -1, last, first)
  fitCubic(p, first, last, t1, t2, err, out)
}

// ---------- Círculo ----------

function fitCircle(p: P[]): { cx: number; cy: number; r: number; err: number } | null {
  const n = p.length
  if (n < 8) return null
  let mx = 0, my = 0
  for (const q of p) { mx += q.x; my += q.y }
  mx /= n; my /= n
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0
  for (const q of p) {
    const u = q.x - mx, v = q.y - my
    suu += u * u; svv += v * v; suv += u * v
    suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u
  }
  const det = suu * svv - suv * suv
  if (Math.abs(det) < 1e-9) return null
  const bu = 0.5 * (suuu + suvv), bv = 0.5 * (svvv + svuu)
  const uc = (bu * svv - bv * suv) / det, vc = (suu * bv - suv * bu) / det
  const cx = uc + mx, cy = vc + my
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n)
  let err = 0
  for (const q of p) err = Math.max(err, Math.abs(Math.hypot(q.x - cx, q.y - cy) - r))
  return { cx, cy, r, err }
}

function circleCurve(cx: number, cy: number, r: number, reversedOrientation: boolean): Curve {
  const k = 0.5522847498 * r
  // sentido igual ao dos pontos (para combinar com a regra de preenchimento)
  const s = reversedOrientation ? -1 : 1
  const segs: Seg[] = [
    { t: 'C', x1: cx + r, y1: cy + s * k, x2: cx + k, y2: cy + s * r, x: cx, y: cy + s * r },
    { t: 'C', x1: cx - k, y1: cy + s * r, x2: cx - r, y2: cy + s * k, x: cx - r, y: cy },
    { t: 'C', x1: cx - r, y1: cy - s * k, x2: cx - k, y2: cy - s * r, x: cx, y: cy - s * r },
    { t: 'C', x1: cx + k, y1: cy - s * r, x2: cx + r, y2: cy - s * k, x: cx + r, y: cy },
  ]
  return { start: { x: cx + r, y: cy }, segs, closed: true, primitive: 'circle' }
}

function signedArea(p: P[]) {
  let a = 0
  for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q.x * r.y - r.x * q.y }
  return a / 2
}

/** Transforma os pontos de uma cadeia em curva (retas + Bézier cúbicas). */
export function fitChain(raw: Float64Array, closed: boolean, opt: FitOptions, hasAA: boolean): Curve {
  let p = toPts(raw)
  // remove pontos repetidos
  p = p.filter((q, i) => i === 0 || Math.hypot(q.x - p[i - 1].x, q.y - p[i - 1].y) > 1e-6)
  if (closed && p.length > 1 && Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) < 1e-6) p.pop()
  const n = p.length
  if (n < 2) return { start: p[0] || { x: 0, y: 0 }, segs: [], closed }
  if (!closed && n === 2) return { start: p[0], segs: [{ t: 'L', x: p[1].x, y: p[1].y }], closed }

  // círculo inteiro?
  if (closed && opt.primitives && n >= 12) {
    const c = fitCircle(p)
    const area = Math.abs(signedArea(p))
    if (c && c.r >= 2 && c.err < Math.max(hasAA ? 0.3 : 0.55, c.r * (hasAA ? 0.03 : 0.05)) &&
      Math.abs(area - Math.PI * c.r * c.r) < Math.PI * c.r * c.r * 0.06) {
      return circleCurve(c.cx, c.cy, c.r, signedArea(p) < 0)
    }
  }

  const corners = findCorners(p, closed, opt.cornerAngle)
  const locked = new Uint8Array(n)
  if (!closed) { locked[0] = 1; locked[n - 1] = 1 }
  for (const c of corners) locked[c] = 1
  // cantos vivos: vértice na interseção das retas
  for (const c of corners) {
    const q = sharpenCorner(p, c, closed)
    if (q) p[c] = q
  }
  // suavização: forte quando a imagem não tem antialiasing (escadinha), leve quando tem
  const iters = Math.round(opt.smooth * (hasAA ? 2 : 6))
  if (iters > 0) taubin(p, closed, locked, iters)

  const segs: Seg[] = []
  if (closed) {
    if (corners.length === 0) {
      // divide em duas metades com tangente contínua
      const half = Math.floor(n / 2)
      const q = [...p, p[0]]
      const tA = norm(sub(p[1], p[n - 1]))
      const tB = norm(sub(p[half + 1], p[half - 1]))
      fitCubic(q, 0, half, tA, mul(tB, -1), opt.tolerance, segs)
      fitCubic(q, half, n, tB, mul(tA, -1), opt.tolerance, segs)
      return { start: p[0], segs, closed }
    }
    // gira para começar num canto
    const s = corners[0]
    const q = [...p.slice(s), ...p.slice(0, s), p[s]]
    const cs = corners.map((c) => (c - s + n) % n).sort((a, b) => a - b)
    cs.push(n)
    for (let i = 0; i < cs.length - 1; i++) fitRun(q, cs[i], cs[i + 1], opt.tolerance, segs)
    return { start: q[0], segs, closed }
  }
  const cs = [0, ...corners.filter((c) => c > 0 && c < n - 1), n - 1]
  for (let i = 0; i < cs.length - 1; i++) fitRun(p, cs[i], cs[i + 1], opt.tolerance, segs)
  return { start: p[0], segs, closed }
}

export function reverseCurve(c: Curve): { start: Point; segs: Seg[] } {
  const pts: Point[] = [c.start]
  for (const s of c.segs) pts.push({ x: s.x, y: s.y })
  const segs: Seg[] = []
  for (let i = c.segs.length - 1; i >= 0; i--) {
    const s = c.segs[i]
    const to = pts[i]
    if (s.t === 'L') segs.push({ t: 'L', x: to.x, y: to.y })
    else segs.push({ t: 'C', x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1, x: to.x, y: to.y })
  }
  return { start: pts[pts.length - 1], segs }
}
