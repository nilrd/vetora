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
  /** px internos por px da imagem original (ampliação interna) */
  scale?: number
  /** só a detecção de trechos retos, mesmo sem as outras formas (foto/ilustração: texto e molduras) */
  lines?: boolean
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

function findCorners(p: P[], closed: boolean, angleDeg: number, scale = 1): number[] {
  const n = p.length
  const out: number[] = []
  // escala do teste em px da imagem original (ampliada 2x por dentro: o dobro de pontos)
  const k = Math.round(2 * Math.sqrt(scale))
  const K2 = Math.round(5 * Math.sqrt(scale))
  if (n < 2 * k + 1) return out
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
function sharpenCorner(p: P[], i: number, closed: boolean, scale = 1): P | null {
  const n = p.length
  const get = (j: number) => (closed ? p[(j + n) % n] : p[Math.max(0, Math.min(n - 1, j))])
  const before: P[] = [], after: P[] = []
  const j0 = Math.round(2 * scale), j1 = Math.round(5 * scale)
  for (let j = j0; j <= j1; j++) { before.push(get(i - j)); after.push(get(i + j)) }
  if (!closed && (i - j1 < 0 || i + j1 >= n)) return null
  const a = fitLine(before), b = fitLine(after)
  if (!a || !b || a.rms > 0.35 * scale || b.rms > 0.35 * scale) return null
  const den = a.dx * b.dy - a.dy * b.dx
  if (Math.abs(den) < 0.2) return null
  const t = ((b.cx - a.cx) * b.dy - (b.cy - a.cy) * b.dx) / den
  const q = { x: a.cx + a.dx * t, y: a.cy + a.dy * t }
  if (Math.hypot(q.x - p[i].x, q.y - p[i].y) > 1.6 * scale) return null
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

/** tIn/tOut: tangentes impostas nas pontas (vindas de uma reta vizinha), para a junção ficar lisa. */
function fitRun(p: P[], first: number, last: number, err: number, out: Seg[], scale = 0, tIn?: P, tOut?: P) {
  if (last - first < 1) return
  if (last - first === 1) { out.push({ t: 'L', x: p[last].x, y: p[last].y }); return }
  // trecho entre dois cantos que é uma reta tremida: uma reta só
  if (scale > 0 && !tIn && !tOut && straightChain(p.slice(first, last + 1), scale)) { out.push({ t: 'L', x: p[last].x, y: p[last].y }); return }
  const t1 = tIn ?? tangentAt(p, first, 1, last, first)
  const t2 = tOut ?? tangentAt(p, last, -1, last, first)
  fitCubic(p, first, last, t1, t2, err, out)
}

// ---------- Polígono com borda tremida ----------

/** Trecho aberto quase reto: longo, perto da corda e sem barriga (arco) em nenhum quarto. */
function straightChain(p: P[], scale: number): boolean {
  const n = p.length
  if (n < 16) return false
  const A = p[0], B = p[n - 1]
  const L = Math.hypot(B.x - A.x, B.y - A.y)
  if (L < 14 * scale) return false
  const res = p.map((q) => ((q.x - A.x) * (B.y - A.y) - (q.y - A.y) * (B.x - A.x)) / L)
  let md = 0
  for (const r of res) md = Math.max(md, Math.abs(r))
  if (md > 1.3 * scale * (1 + Math.min(1, L / (80 * scale)))) return false
  const qn = Math.floor(n / 4)
  for (let s0 = 0; s0 + qn <= n; s0 += qn) {
    let sm = 0
    for (let i = s0; i < s0 + qn; i++) sm += res[i]
    if (Math.abs(sm / qn) > 0.35 * scale) return false
  }
  return true
}

/** Douglas-Peucker num trecho aberto: índices dos vértices mantidos. */
function dp(p: P[], a: number, b: number, eps: number, out: number[]) {
  const A = p[a], B = p[b]
  const L = Math.hypot(B.x - A.x, B.y - A.y) || 1e-9
  let md = -1, mi = -1
  for (let i = a + 1; i < b; i++) {
    const d = Math.abs((p[i].x - A.x) * (B.y - A.y) - (p[i].y - A.y) * (B.x - A.x)) / L
    if (d > md) { md = d; mi = i }
  }
  if (md > eps && mi > 0) { dp(p, a, mi, eps, out); out.push(mi); dp(p, mi, b, eps, out) }
}

/**
 * Contorno que é um polígono de poucas retas longas, só que com a borda tremida
 * (imagem pequena ampliada, JPEG, print de tela). Sem isso cada "mordida" vira curva e
 * a reta sai ondulada. Exige: poucos lados, lados longos, cantos de verdade (giro grande)
 * e pontos dos dois lados de cada reta (num arco eles ficam todos de um lado só).
 */
function noisyPolygon(p0: P[], scale: number): Curve | null {
  const n = p0.length
  if (n < 30) return null
  // começa no ponto mais distante do primeiro (um canto provável)
  let far = 0, fd = -1
  for (let i = 0; i < n; i++) { const d = (p0[i].x - p0[0].x) ** 2 + (p0[i].y - p0[0].y) ** 2; if (d > fd) { fd = d; far = i } }
  const p = [...p0.slice(far), ...p0.slice(0, far), p0[far]]
  // cópia alisada (média móvel de ~5 px) só para achar os cantos: as mordidas somem, as retas ficam
  const Wm = Math.max(3, Math.round(5 * scale))
  const sm: P[] = []
  for (let i = 0; i <= n; i++) {
    let sx = 0, sy = 0
    for (let j = -Wm; j <= Wm; j++) { const q = p[(((i + j) % n) + n) % n]; sx += q.x; sy += q.y }
    sm.push({ x: sx / (2 * Wm + 1), y: sy / (2 * Wm + 1) })
  }
  const eps = 2.2 * scale
  // laço fechado: divide no ponto mais longe do início e simplifica as duas metades
  let mid = 0, md2 = -1
  for (let i = 1; i < n; i++) { const d = (sm[i].x - sm[0].x) ** 2 + (sm[i].y - sm[0].y) ** 2; if (d > md2) { md2 = d; mid = i } }
  const idx = [0]
  dp(sm, 0, mid, eps, idx)
  idx.push(mid)
  dp(sm, mid, n, eps, idx)
  idx.push(n)
  // o ponto inicial pode não ser canto: tira se o giro ali for pequeno
  const m0 = idx.length - 1
  if (m0 < 3 || m0 > 24) return null
  let verts = idx.slice(0, -1)
  const turn = (a: P, b: P, c: P) => {
    const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy)
    return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv || 1)))) * 180 / Math.PI
  }
  const P0 = (k: number) => sm[verts[(k + verts.length) % verts.length]]
  verts = verts.filter((_, k) => turn(P0(k - 1), P0(k), P0(k + 1)) >= 30)
  // lado mínimo: um retângulo (4 cantos retos) pode ser fino (traço, barra); nos outros, lado curto é canto mordido
  const isRect = verts.length === 4 && [0, 1, 2, 3].every((k) => { const a = turn(P0(k - 1), P0(k), P0(k + 1)); return a > 75 && a < 105 })
  const minSide = (isRect ? 3 : 12) * scale
  // lado curtinho = canto arredondado ou mordido: some, e o canto vira a interseção das retas vizinhas
  for (let guard = 0; guard < 20 && verts.length > 3; guard++) {
    let ks = -1, best = Infinity
    for (let k = 0; k < verts.length; k++) {
      const A = P0(k), B = P0(k + 1), L = Math.hypot(B.x - A.x, B.y - A.y)
      if (L < minSide && L < best) { best = L; ks = k }
    }
    if (ks < 0) break
    // tira o vértice cujo giro é menor (o outro vira o canto)
    const k2 = (ks + 1) % verts.length
    const drop = turn(P0(ks - 1), P0(ks), P0(ks + 1)) < turn(P0(k2 - 1), P0(k2), P0(k2 + 1)) ? ks : k2
    verts.splice(drop, 1)
  }
  const m = verts.length
  if (m < 3 || m > 10) return null
  // cada lado: longo, reto (pontos dos dois lados da reta) e com tremor pequeno
  const lines: { cx: number; cy: number; dx: number; dy: number }[] = []
  for (let k = 0; k < m; k++) {
    const a = verts[k], b = k + 1 < m ? verts[k + 1] : verts[0] + n
    const A = p[a % n], B = p[b % n]
    const L = Math.hypot(B.x - A.x, B.y - A.y)
    if (L < minSide) return null
    // ignora as pontas (perto dos cantos a borda arredonda)
    const cut = Math.max(2, Math.floor((b - a) * 0.15))
    const seg: P[] = []
    for (let i = a + cut; i <= b - cut; i++) seg.push(p[i % n])
    const f = fitLine(seg)
    // lado longo: o tremor (arte traçada à mão, ampliada) se dilui; aceita mais
    const longF = 1 + Math.min(1, L / (80 * scale))
    if (!f || f.rms > 0.9 * scale * longF) return null
    // curva disfarçada (arco ou "S"): em algum quarto do lado os pontos ficam, em média,
    // longe da reta. Tremor de verdade se anula dentro de cada quarto.
    const res = seg.map((q) => (q.x - f.cx) * -f.dy + (q.y - f.cy) * f.dx)
    const qn = Math.max(1, Math.floor(res.length / 4))
    for (let s0 = 0; s0 + qn <= res.length; s0 += qn) {
      let sm = 0
      for (let i = s0; i < s0 + qn; i++) sm += res[i]
      if (Math.abs(sm / qn) > 0.35 * scale * longF) return null
    }
    lines.push(f)
  }
  // vértices: interseção das retas vizinhas
  const pts: P[] = []
  for (let k = 0; k < m; k++) {
    const a = lines[(k - 1 + m) % m], b = lines[k]
    const den = a.dx * b.dy - a.dy * b.dx
    const orig = p[verts[k]]
    let q = orig
    if (Math.abs(den) > 0.05) {
      const t = ((b.cx - a.cx) * b.dy - (b.cy - a.cy) * b.dx) / den
      const c = { x: a.cx + a.dx * t, y: a.cy + a.dy * t }
      if (Math.hypot(c.x - orig.x, c.y - orig.y) < 6 * scale) q = c
    }
    pts.push(q)
  }
  // conferência final: nenhum ponto da borda pode ficar longe do polígono
  // (canto arredondado de verdade, ou detalhe que o polígono apagou, recusa)
  // perto de canto agudo (< 75°) aceita mais: o borrão da imagem arredonda muito a ponta aguda
  const acute = pts.map((B, k) => {
    const A = pts[(k - 1 + m) % m], C = pts[(k + 1) % m]
    const ux = A.x - B.x, uy = A.y - B.y, vx = C.x - B.x, vy = C.y - B.y
    const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1)
    // ponta de triângulo grande (não a ponta redonda de um traço fino)
    const long = Math.hypot(ux, uy) > 30 * scale && Math.hypot(vx, vy) > 30 * scale
    return long && Math.acos(Math.max(-1, Math.min(1, cos))) < (75 * Math.PI) / 180
  })
  // canto arredondado de propósito: os pontos da borda não chegam perto do vértice vivo.
  // A distância mínima até o vértice dá o raio: d = r·(1/sen(θ/2) − 1).
  const fillet: { r: number; tlen: number; theta: number }[] = []
  const reach2 = (14 * scale) ** 2
  for (let k = 0; k < m; k++) {
    const B = pts[k], A = pts[(k - 1 + m) % m], C = pts[(k + 1) % m]
    const ux = A.x - B.x, uy = A.y - B.y, vx = C.x - B.x, vy = C.y - B.y
    const la = Math.hypot(ux, uy), lc = Math.hypot(vx, vy)
    const cos = (ux * vx + uy * vy) / (la * lc || 1)
    const theta = Math.acos(Math.max(-1, Math.min(1, cos)))
    let dmin = Infinity
    for (const q of p0) { const d2 = (q.x - B.x) ** 2 + (q.y - B.y) ** 2; if (d2 < reach2 && d2 < dmin) dmin = d2 }
    dmin = Math.sqrt(dmin)
    const f = 1 / Math.sin(theta / 2) - 1
    // canto vivo com antialiasing afasta os pontos ~1 px do vértice; só é arredondado de verdade
    // se afasta bem mais que isso (e o raio resultante é visível)
    let r = dmin > 1.8 * scale && f > 0.05 ? dmin / f : 0
    const tlenMax = Math.min(la, lc) * 0.4
    let tlen = r / Math.tan(theta / 2)
    if (tlen > tlenMax) { tlen = tlenMax; r = tlen * Math.tan(theta / 2) }
    fillet.push({ r: r >= 2.5 * scale ? r : 0, tlen, theta })
  }
  let perim = 0
  for (let k = 0; k < m; k++) { const A = pts[k], B = pts[(k + 1) % m]; perim += Math.hypot(B.x - A.x, B.y - A.y) }
  const longPoly = 1 + Math.min(1, perim / m / (80 * scale))
  const lim = (2 * scale * longPoly) ** 2, limTip = (4.5 * scale * longPoly) ** 2, near2 = (10 * scale) ** 2
  for (const q of p0) {
    // perto de um canto arredondado a distância ao polígono vivo não vale
    if (fillet.some((f, k) => f.r > 0 && (q.x - pts[k].x) ** 2 + (q.y - pts[k].y) ** 2 < (f.tlen * 1.3) ** 2)) continue
    let best = Infinity
    for (let k = 0; k < m; k++) {
      const A = pts[k], B = pts[(k + 1) % m]
      const vx = B.x - A.x, vy = B.y - A.y, L2 = vx * vx + vy * vy || 1e-9
      const tt = Math.max(0, Math.min(1, ((q.x - A.x) * vx + (q.y - A.y) * vy) / L2))
      const d = (A.x + vx * tt - q.x) ** 2 + (A.y + vy * tt - q.y) ** 2
      if (d < best) best = d
    }
    if (best > lim) {
      const tip = pts.some((v, k) => acute[k] && (v.x - q.x) ** 2 + (v.y - q.y) ** 2 < near2)
      if (!tip || best > limTip) return null
    }
  }
  // monta: reta até o início do arredondado, arco (Bézier) até o fim, e assim por diante
  const segs: Seg[] = []
  const tang = (k: number) => {
    const B = pts[k], A = pts[(k - 1 + m) % m], C = pts[(k + 1) % m]
    const f = fillet[k]
    if (!f.r) return { in: B, out: B }
    const ua = Math.hypot(A.x - B.x, A.y - B.y), uc = Math.hypot(C.x - B.x, C.y - B.y)
    return {
      in: { x: B.x + ((A.x - B.x) / ua) * f.tlen, y: B.y + ((A.y - B.y) / ua) * f.tlen },
      out: { x: B.x + ((C.x - B.x) / uc) * f.tlen, y: B.y + ((C.y - B.y) / uc) * f.tlen },
    }
  }
  const T = pts.map((_, k) => tang(k))
  const start = T[0].out
  for (let k = 1; k <= m; k++) {
    const kk = k % m
    segs.push({ t: 'L', x: T[kk].in.x, y: T[kk].in.y })
    const f = fillet[kk]
    if (f.r) {
      // arco de ângulo φ = π − θ: alças a 4/3·tan(φ/4)·r ao longo das tangentes
      const phi = Math.PI - f.theta
      const h = (4 / 3) * Math.tan(phi / 4) * f.r
      const B = pts[kk], I = T[kk].in, O = T[kk].out
      const di = Math.hypot(B.x - I.x, B.y - I.y) || 1, doo = Math.hypot(B.x - O.x, B.y - O.y) || 1
      segs.push({ t: 'C', x1: I.x + ((B.x - I.x) / di) * h, y1: I.y + ((B.y - I.y) / di) * h, x2: O.x + ((B.x - O.x) / doo) * h, y2: O.y + ((B.y - O.y) / doo) * h, x: O.x, y: O.y })
    }
  }
  return { start, segs, closed: true }
}

/**
 * Versão aberta do polígono: cadeia entre dois encontros que é uma sequência de retas tremidas
 * (contorno de letra que encosta em outra forma, borda cortada pela imagem). Pontas fixas.
 */
function noisyPolyline(p: P[], scale: number): Curve | null {
  const n = p.length
  if (n < 30) return null
  const Wm = Math.max(3, Math.round(5 * scale))
  const sm: P[] = []
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, c = 0
    for (let j = -Wm; j <= Wm; j++) { const k = i + j; if (k < 0 || k >= n) continue; sx += p[k].x; sy += p[k].y; c++ }
    sm.push({ x: sx / c, y: sy / c })
  }
  const idx = [0]
  dp(sm, 0, n - 1, 2.2 * scale, idx)
  idx.push(n - 1)
  if (idx.length > 26) return null
  const turn = (a: P, b: P, c: P) => {
    const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y
    return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1)))) * 180 / Math.PI
  }
  let verts = idx.filter((v, k) => k === 0 || k === idx.length - 1 || turn(sm[idx[k - 1]], sm[v], sm[idx[k + 1]]) >= 30)
  // lados curtos no meio: canto mordido, tira o vértice de menor giro
  for (let guard = 0; guard < 20 && verts.length > 2; guard++) {
    let ks = -1, best = Infinity
    for (let k = 0; k < verts.length - 1; k++) {
      const L = Math.hypot(sm[verts[k + 1]].x - sm[verts[k]].x, sm[verts[k + 1]].y - sm[verts[k]].y)
      if (L < 22 * scale && L < best) { best = L; ks = k }
    }
    if (ks < 0) break
    const cand = [ks, ks + 1].filter((k) => k > 0 && k < verts.length - 1)
    if (!cand.length) return null
    const tk = (k: number) => turn(sm[verts[k - 1]], sm[verts[k]], sm[verts[k + 1]])
    const drop = cand.length === 2 && tk(cand[0]) >= tk(cand[1]) ? cand[1] : cand[0]
    verts.splice(drop, 1)
  }
  const m = verts.length
  if (m < 3) return null // uma reta só: straightChain faz melhor (ajusta as pontas)
  const lines: { cx: number; cy: number; dx: number; dy: number }[] = []
  for (let k = 0; k < m - 1; k++) {
    const a = verts[k], b = verts[k + 1]
    const L = Math.hypot(p[b].x - p[a].x, p[b].y - p[a].y)
    if (L < 14 * scale) return null
    const cut = Math.max(2, Math.floor((b - a) * 0.15))
    const seg = p.slice(a + cut, b - cut + 1)
    const f = fitLine(seg)
    const longF = 1 + Math.min(1, L / (80 * scale))
    if (!f || f.rms > 0.9 * scale * longF) return null
    const res = seg.map((q) => (q.x - f.cx) * -f.dy + (q.y - f.cy) * f.dx)
    const qn = Math.max(1, Math.floor(res.length / 4))
    for (let s0 = 0; s0 + qn <= res.length; s0 += qn) {
      let sum = 0
      for (let i = s0; i < s0 + qn; i++) sum += res[i]
      if (Math.abs(sum / qn) > 0.35 * scale * longF) return null
    }
    lines.push(f)
  }
  // vértices internos na interseção das retas. As pontas são vértices da grade (encontro de
  // cores): ficam, mas a reta de verdade passa pela projeção delas na reta ajustada
  const proj = (f: { cx: number; cy: number; dx: number; dy: number }, q: P) => { const tt = (q.x - f.cx) * f.dx + (q.y - f.cy) * f.dy; return { x: f.cx + f.dx * tt, y: f.cy + f.dy * tt } }
  const pts: P[] = [p[0]]
  const p0p = proj(lines[0], p[0])
  if (Math.hypot(p0p.x - p[0].x, p0p.y - p[0].y) < 1.5 * scale) pts.push(p0p)
  for (let k = 1; k < m - 1; k++) {
    const a = lines[k - 1], b = lines[k]
    const den = a.dx * b.dy - a.dy * b.dx
    const orig = p[verts[k]]
    let q = orig
    if (Math.abs(den) > 0.05) {
      const tt = ((b.cx - a.cx) * b.dy - (b.cy - a.cy) * b.dx) / den
      const c = { x: a.cx + a.dx * tt, y: a.cy + a.dy * tt }
      if (Math.hypot(c.x - orig.x, c.y - orig.y) < 6 * scale) q = c
    }
    pts.push(q)
  }
  const pnp = proj(lines[m - 2], p[n - 1])
  if (Math.hypot(pnp.x - p[n - 1].x, pnp.y - p[n - 1].y) < 1.5 * scale) pts.push(pnp)
  pts.push(p[n - 1])
  // nenhum ponto longe da polilinha
  const lim = (2.4 * scale) ** 2
  for (const q of p) {
    let best = Infinity
    for (let k = 0; k < pts.length - 1; k++) {
      const A = pts[k], B = pts[k + 1]
      const vx = B.x - A.x, vy = B.y - A.y, L2 = vx * vx + vy * vy || 1e-9
      const tt = Math.max(0, Math.min(1, ((q.x - A.x) * vx + (q.y - A.y) * vy) / L2))
      const d = (A.x + vx * tt - q.x) ** 2 + (A.y + vy * tt - q.y) ** 2
      if (d < best) best = d
    }
    if (best > lim) return null
  }
  return { start: pts[0], segs: pts.slice(1).map((q) => ({ t: 'L' as const, x: q.x, y: q.y })), closed: false }
}

// ---------- Trechos retos dentro de uma curva ----------

/**
 * Acha, dentro do trecho [a, b], pedaços que são RETAS (a lateral de uma haste com ponta redonda,
 * o lado de um "D"). Sem isso a lateral é ajustada como curva e segue a escadinha da borda: sai ondulada.
 * Critério: longo (>= 40 px da imagem), todos os pontos perto da corda e SEM barriga: um arco
 * grande também fica perto da corda, mas o meio dele fica de um lado e as pontas do outro.
 */
function lineSpans(q: P[], a: number, b: number, scale: number): [number, number][] {
  const out: [number, number][] = []
  const minLen = 40 * scale, tol = 0.8 * scale, maxBow = 0.08 * scale
  const chordOk = (i: number, j: number) => {
    const A = q[i], B = q[j]
    const L = Math.hypot(B.x - A.x, B.y - A.y)
    if (L < 1e-9) return false
    for (let k = i + 1; k < j; k++) if (Math.abs((q[k].x - A.x) * (B.y - A.y) - (q[k].y - A.y) * (B.x - A.x)) / L > tol) return false
    return true
  }
  const straight = (i: number, j: number) => {
    const seg = q.slice(i, j + 1)
    const f = fitLine(seg)
    if (!f || f.rms > 0.35 * scale) return false
    const res = seg.map((r) => (r.x - f.cx) * -f.dy + (r.y - f.cy) * f.dx)
    const t3 = Math.floor(res.length / 3)
    if (t3 < 2) return false
    let mid = 0, ends = 0
    for (let k = 0; k < res.length; k++) { if (k >= t3 && k < res.length - t3) mid += res[k]; else ends += res[k] }
    const bow = mid / (res.length - 2 * t3) - ends / (2 * t3)
    return Math.abs(bow) <= maxBow
  }
  let i = a
  const minPts = Math.max(6, Math.round(6 * scale))
  while (i + minPts <= b) {
    if (!chordOk(i, i + minPts)) { i++; continue }
    // cresce enquanto a corda aguenta (passos que dobram, depois volta ao último bom)
    let good = i + minPts, step = minPts
    while (good + step <= b && chordOk(i, good + step)) { good += step; step *= 2 }
    for (let s = step >> 1; s >= 1; s >>= 1) if (good + s <= b && chordOk(i, good + s)) good += s
    const L = Math.hypot(q[good].x - q[i].x, q[good].y - q[i].y)
    if (L >= minLen && straight(i, good)) { out.push([i, good]); i = good } else i++
  }
  return out
}

/** fitRun, mas com os trechos retos viram reta (as junções caem na reta ajustada). */
function fitRunSpans(q: P[], a: number, b: number, err: number, out: Seg[], scale: number) {
  // só sem ampliação interna (scale 1): em imagem pequena ampliada a escadinha já some e as retas atrapalham
  if (scale !== 1 || b - a < 12) { fitRun(q, a, b, err, out, scale); return }
  // só mexe onde o ajuste normal está ondulando (muitos pedaços para o tamanho do trecho);
  // borda limpa, que já sai lisa, fica exatamente como era
  const tmp: Seg[] = []
  fitRun(q, a, b, err, tmp, scale)
  let len = 0
  for (let i = a + 1; i <= b; i++) len += Math.hypot(q[i].x - q[i - 1].x, q[i].y - q[i - 1].y)
  if (tmp.length <= 1 + len / (50 * scale)) { out.push(...tmp); return }
  const spans = lineSpans(q, a, b, scale)
  if (!spans.length) { out.push(...tmp); return }
  // pontas internas de cada reta: projetadas na reta ajustada (cantos e pontas do trecho ficam)
  for (const [s, e] of spans) {
    const f = fitLine(q.slice(s, e + 1))
    if (!f) continue
    const proj = (r: P) => { const t = (r.x - f.cx) * f.dx + (r.y - f.cy) * f.dy; return { x: f.cx + f.dx * t, y: f.cy + f.dy * t } }
    if (s !== a) q[s] = proj(q[s])
    if (e !== b) q[e] = proj(q[e])
  }
  // direção de cada reta: a curva que encosta nela sai/chega na mesma direção (sem quina)
  const dir = spans.map(([s, e]) => norm(sub(q[e], q[s])))
  let cur = a
  let prevDir: P | undefined
  spans.forEach(([s, e], k) => {
    if (s > cur) fitRun(q, cur, s, err, out, scale, prevDir, mul(dir[k], -1))
    out.push({ t: 'L', x: q[e].x, y: q[e].y })
    cur = e
    prevDir = dir[k]
  })
  if (cur < b) fitRun(q, cur, b, err, out, scale, prevDir, undefined)
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
  // laço minúsculo (2 ou 3 pontos): só retas, não há curva a ajustar
  if (closed && n < 4) return { start: p[0], segs: p.slice(1).map((q) => ({ t: 'L' as const, x: q.x, y: q.y })), closed }

  // círculo inteiro?
  if (closed && opt.primitives && n >= 12) {
    const c = fitCircle(p)
    const area = Math.abs(signedArea(p))
    if (c && c.r >= 2 && c.err < Math.max(hasAA ? 0.3 : 0.55, c.r * (hasAA ? 0.03 : 0.05)) &&
      Math.abs(area - Math.PI * c.r * c.r) < Math.PI * c.r * c.r * 0.06) {
      return circleCurve(c.cx, c.cy, c.r, signedArea(p) < 0)
    }
  }

  // trecho aberto (entre dois encontros de cores) que é uma reta tremida: vira uma reta só
  if (!closed && opt.primitives) {
    const pl = noisyPolyline(p, opt.scale || 1)
    if (pl) return pl
  }
  if (!closed && opt.primitives && straightChain(p, opt.scale || 1)) {
    // as pontas são vértices da grade (encontro de cores); a reta de verdade passa pelos pontos
    // do meio, medidos com precisão sub-pixel. Liga as pontas à reta ajustada.
    const f = fitLine(p.slice(2, n - 2))
    if (f) {
      const proj = (q: P) => { const t = (q.x - f.cx) * f.dx + (q.y - f.cy) * f.dy; return { x: f.cx + f.dx * t, y: f.cy + f.dy * t } }
      const a = proj(p[0]), b = proj(p[n - 1])
      const sc = opt.scale || 1
      if (Math.hypot(a.x - p[0].x, a.y - p[0].y) < 1.5 * sc && Math.hypot(b.x - p[n - 1].x, b.y - p[n - 1].y) < 1.5 * sc) {
        return { start: p[0], segs: [{ t: 'L', x: a.x, y: a.y }, { t: 'L', x: b.x, y: b.y }, { t: 'L', x: p[n - 1].x, y: p[n - 1].y }], closed }
      }
    }
    return { start: p[0], segs: [{ t: 'L', x: p[n - 1].x, y: p[n - 1].y }], closed }
  }
  // polígono de retas com borda tremida (logo de baixa resolução, "mordido")?
  if (closed && opt.primitives) {
    const poly = noisyPolygon(p, opt.scale || 1)
    if (poly) return poly
  }

  const corners = findCorners(p, closed, opt.cornerAngle, opt.scale || 1)
  const locked = new Uint8Array(n)
  if (!closed) { locked[0] = 1; locked[n - 1] = 1 }
  for (const c of corners) locked[c] = 1
  // cantos vivos: vértice na interseção das retas
  for (const c of corners) {
    const q = sharpenCorner(p, c, closed, opt.scale || 1)
    if (q) p[c] = q
  }
  // suavização: forte quando a imagem não tem antialiasing (escadinha), leve quando tem
  const iters = Math.round(opt.smooth * (hasAA ? 2 : 6))
  if (iters > 0) taubin(p, closed, locked, iters)

  const segs: Seg[] = []
  if (closed) {
    if (corners.length === 0) {
      // sem cantos, mas com laterais retas (haste de ponta redonda): começa numa reta e segue
      if (opt.primitives || opt.lines) {
        const sc = opt.scale || 1
        const q0 = [...p, p[0]]
        const sp = lineSpans(q0, 0, n, sc)
        if (sp.length) {
          const s = sp[0][0]
          const q = [...p.slice(s), ...p.slice(0, s), p[s]]
          fitRunSpans(q, 0, n, opt.tolerance, segs, sc)
          return { start: q[0], segs, closed }
        }
      }
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
    for (let i = 0; i < cs.length - 1; i++) fitRunSpans(q, cs[i], cs[i + 1], opt.tolerance, segs, opt.primitives || opt.lines ? opt.scale || 1 : 0)
    return { start: q[0], segs, closed }
  }
  const cs = [0, ...corners.filter((c) => c > 0 && c < n - 1), n - 1]
  for (let i = 0; i < cs.length - 1; i++) fitRunSpans(p, cs[i], cs[i + 1], opt.tolerance, segs, opt.primitives || opt.lines ? opt.scale || 1 : 0)
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
