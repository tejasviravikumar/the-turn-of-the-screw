// Pattern geometry model. All coordinates are in centimetres (doc.unit === "cm").
export type Vec = { x: number; y: number };
export type PPoint = { id: string; x: number; y: number; h1?: Vec; h2?: Vec }; // handles are offsets
export type Notch = { id: string; x: number; y: number };
export type Grainline = { id: string; x1: number; y1: number; x2: number; y2: number };
export type Label = { id: string; x: number; y: number; text: string };
export type Piece = {
  id: string;
  name: string;
  points: PPoint[];
  seam: number; // cm
  notches: Notch[];
  grainlines: Grainline[];
  labels: Label[];
  folds: [string, string][]; // pairs of point ids forming a fold edge
  hidden?: boolean;
};
export type PatternDoc = {
  unit: "cm";
  pieces: Piece[];
  showGrid: boolean;
  showRulers: boolean;
  showReference: boolean;
  reference?: string; // data URL
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export function segIsCurve(a: PPoint, b: PPoint) {
  return !!(a.h2 || b.h1);
}

export function piecePath(p: Piece) {
  const pts = p.points;
  if (pts.length < 2) return "";
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (segIsCurve(a, b)) {
      const c1 = a.h2 ? { x: a.x + a.h2.x, y: a.y + a.h2.y } : a;
      const c2 = b.h1 ? { x: b.x + b.h1.x, y: b.y + b.h1.y } : b;
      d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`;
    } else d += ` L${b.x},${b.y}`;
  }
  return d + " Z";
}

function cubic(a: Vec, c1: Vec, c2: Vec, b: Vec, t: number): Vec {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  };
}

/** Samples outline; returns points with the segment index each came from. */
export function sampleOutline(p: Piece, perCurve = 16): { pt: Vec; seg: number; t: number }[] {
  const out: { pt: Vec; seg: number; t: number }[] = [];
  const pts = p.points;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (segIsCurve(a, b)) {
      const c1 = a.h2 ? { x: a.x + a.h2.x, y: a.y + a.h2.y } : a;
      const c2 = b.h1 ? { x: b.x + b.h1.x, y: b.y + b.h1.y } : b;
      for (let k = 0; k < perCurve; k++) out.push({ pt: cubic(a, c1, c2, b, k / perCurve), seg: i, t: k / perCurve });
    } else out.push({ pt: { x: a.x, y: a.y }, seg: i, t: 0 });
  }
  return out;
}

export function signedArea(poly: Vec[]) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function segIntersect(p1: Vec, p2: Vec, p3: Vec, p4: Vec) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-12) return false;
  const ua = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const ub = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return ua > 1e-9 && ua < 1 - 1e-9 && ub > 1e-9 && ub < 1 - 1e-9;
}

export function selfIntersects(poly: Vec[]) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
    }
  }
  return false;
}

export type OffsetResult = { ok: true; poly: Vec[] } | { ok: false; reason: string };

/** Mitred polygon offset of the sampled outline. Fails honestly on invalid input/output. */
export function seamOffset(p: Piece): OffsetResult {
  if (p.seam <= 0) return { ok: false, reason: "No seam allowance set" };
  const raw = sampleOutline(p).map((s) => s.pt);
  // dedupe
  const poly = raw.filter((v, i) => {
    const n = raw[(i + 1) % raw.length];
    return Math.hypot(v.x - n.x, v.y - n.y) > 1e-6;
  });
  if (poly.length < 3) return { ok: false, reason: "Outline needs at least 3 points" };
  if (selfIntersects(poly)) return { ok: false, reason: "Outline crosses itself" };
  const dir = signedArea(poly) > 0 ? 1 : -1;
  const d = p.seam;
  const out: Vec[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n], cur = poly[i], next = poly[(i + 1) % n];
    const e1 = norm({ x: cur.x - prev.x, y: cur.y - prev.y });
    const e2 = norm({ x: next.x - cur.x, y: next.y - cur.y });
    // outward normals (for positive area in y-down svg, outward is (dy,-dx)*-dir)
    const n1 = { x: -e1.y * dir * -1, y: e1.x * dir * -1 };
    const n2 = { x: -e2.y * dir * -1, y: e2.x * dir * -1 };
    const bis = norm({ x: n1.x + n2.x, y: n1.y + n2.y });
    const cos = bis.x * n2.x + bis.y * n2.y;
    if (cos < 0.25) {
      // sharp corner: bevel instead of an extreme miter
      out.push({ x: cur.x + n1.x * d, y: cur.y + n1.y * d }, { x: cur.x + n2.x * d, y: cur.y + n2.y * d });
    } else out.push({ x: cur.x + (bis.x * d) / cos, y: cur.y + (bis.y * d) / cos });
  }
  if (selfIntersects(out)) return { ok: false, reason: "Allowance too large for this shape (offset crosses itself)" };
  if (Math.abs(signedArea(out)) < Math.abs(signedArea(poly))) return { ok: false, reason: "Offset failed" };
  return { ok: true, poly: out };
}

function norm(v: Vec) {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

export function bounds(pieces: Piece[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pieces)
    for (const s of sampleOutline(p, 8)) {
      minX = Math.min(minX, s.pt.x); minY = Math.min(minY, s.pt.y);
      maxX = Math.max(maxX, s.pt.x); maxY = Math.max(maxY, s.pt.y);
    }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  return { minX, minY, maxX, maxY };
}

export function centroid(p: Piece): Vec {
  const b = bounds([p]);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/** Applies an affine map to every coordinate of a piece (points, handles, annotations). */
export function transformPiece(p: Piece, f: (v: Vec) => Vec, linear: (v: Vec) => Vec, flips = false): Piece {
  const pts = p.points.map((q) => {
    const r = f(q);
    let h1 = q.h1 && linear(q.h1);
    let h2 = q.h2 && linear(q.h2);
    return { ...q, ...r, h1, h2 };
  });
  // mirroring reverses winding; reverse order so handles stay attached to the right side
  const points = flips
    ? pts.slice().reverse().map((q) => ({ ...q, h1: q.h2, h2: q.h1 }))
    : pts;
  return {
    ...p,
    points,
    notches: p.notches.map((n) => ({ ...n, ...f(n) })),
    labels: p.labels.map((l) => ({ ...l, ...f(l) })),
    grainlines: p.grainlines.map((g) => {
      const a = f({ x: g.x1, y: g.y1 }), b = f({ x: g.x2, y: g.y2 });
      return { ...g, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }),
  };
}

export const translatePiece = (p: Piece, dx: number, dy: number) =>
  transformPiece(p, (v) => ({ x: v.x + dx, y: v.y + dy }), (v) => v);

export function rotatePiece(p: Piece, deg: number) {
  const c = centroid(p), r = (deg * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
  const lin = (v: Vec) => ({ x: v.x * cs - v.y * sn, y: v.x * sn + v.y * cs });
  return transformPiece(p, (v) => { const l = lin({ x: v.x - c.x, y: v.y - c.y }); return { x: l.x + c.x, y: l.y + c.y }; }, lin);
}

export function mirrorPiece(p: Piece, axis: "h" | "v") {
  const c = centroid(p);
  const lin = (v: Vec) => (axis === "h" ? { x: -v.x, y: v.y } : { x: v.x, y: -v.y });
  return transformPiece(p, (v) => (axis === "h" ? { x: 2 * c.x - v.x, y: v.y } : { x: v.x, y: 2 * c.y - v.y }), lin, true);
}

export function clonePiece(p: Piece, dx = 4, dy = 4): Piece {
  const idMap = new Map<string, string>();
  const points = p.points.map((q) => { const id = uid(); idMap.set(q.id, id); return { ...q, id }; });
  const c = translatePiece({ ...p, points }, dx, dy);
  return {
    ...c,
    id: uid(),
    name: p.name + " copy",
    notches: c.notches.map((n) => ({ ...n, id: uid() })),
    labels: c.labels.map((n) => ({ ...n, id: uid() })),
    grainlines: c.grainlines.map((n) => ({ ...n, id: uid() })),
    folds: p.folds.map(([a, b]) => [idMap.get(a)!, idMap.get(b)!] as [string, string]),
  };
}

export function nearestOnOutline(p: Piece, v: Vec) {
  const s = sampleOutline(p, 32);
  let best = { d: Infinity, pt: s[0]?.pt, seg: 0 };
  for (let i = 0; i < s.length; i++) {
    const a = s[i].pt, b = s[(i + 1) % s.length].pt;
    const abx = b.x - a.x, aby = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((v.x - a.x) * abx + (v.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
    const q = { x: a.x + abx * t, y: a.y + aby * t };
    const d = Math.hypot(q.x - v.x, q.y - v.y);
    if (d < best.d) best = { d, pt: q, seg: s[i].seg };
  }
  return best;
}

export function pointInPiece(p: Piece, v: Vec) {
  const poly = sampleOutline(p, 12).map((s) => s.pt);
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > v.y !== b.y > v.y && v.x < ((b.x - a.x) * (v.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function P(x: number, y: number, h1?: Vec, h2?: Vec): PPoint {
  return { id: uid(), x, y, h1, h2 };
}

/** Illustrative starter pieces — not a validated sewing pattern. */
export function starterDoc(): PatternDoc {
  const neck = P(0, 6, undefined, undefined);
  const cfWaist = P(0, 44);
  const bodice: Piece = {
    id: uid(),
    name: "Bodice front",
    seam: 1.5,
    points: [
      P(0, 0 + 6, undefined, { x: 4, y: 0 }),
      P(8, 0, { x: -2, y: 4 }),
      P(20, 3),
      P(21, 14, { x: -3, y: -3 }, { x: 2, y: 4 }),
      P(24, 20),
      P(21, 44),
      cfWaist,
    ],
    notches: [],
    grainlines: [{ id: uid(), x1: 10, y1: 16, x2: 10, y2: 36 }],
    labels: [{ id: uid(), x: 6, y: 28, text: "Front · cut 1 on fold" }],
    folds: [],
  };
  bodice.folds = [[cfWaist.id, bodice.points[0].id]];
  void neck;
  const sleeve: Piece = {
    id: uid(),
    name: "Sleeve",
    seam: 1.5,
    points: [
      P(40, 14, undefined, { x: 6, y: -8 }),
      P(55, 2, { x: -7, y: 0 }, { x: 7, y: 0 }),
      P(70, 14, { x: -6, y: -8 }),
      P(66, 56),
      P(44, 56),
    ],
    notches: [{ id: uid(), x: 55, y: 2 }],
    grainlines: [{ id: uid(), x1: 55, y1: 18, x2: 55, y2: 46 }],
    labels: [{ id: uid(), x: 49, y: 34, text: "Sleeve · cut 2" }],
    folds: [],
  };
  return { unit: "cm", pieces: [bodice, sleeve], showGrid: true, showRulers: true, showReference: true };
}
