import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  MousePointer2, Move, CirclePlus, PenLine, Spline, Triangle, ChevronsDown, ArrowUpDown, FoldVertical,
  Type, Trash2, Undo2, Redo2, Copy, RotateCw, FlipHorizontal2, FlipVertical2, ZoomIn, ZoomOut, Maximize,
  Grid3x3, Ruler, Image as ImageIcon, ArrowUp, ArrowDown, LocateFixed,
} from "lucide-react";
import {
  bounds, clonePiece, mirrorPiece, nearestOnOutline, piecePath, pointInPiece, rotatePiece, seamOffset,
  translatePiece, uid, type PatternDoc, type Piece, type Vec,
} from "@/lib/pattern/geometry";
import { useHistory } from "@/lib/pattern/useHistory";
import { saveProject, type Project } from "@/lib/pattern/projects";

type Tool = "select" | "move" | "point" | "line" | "curve" | "notch" | "dart" | "grain" | "fold" | "text" | "delete";
type Sel =
  | { kind: "piece"; piece: string }
  | { kind: "point"; piece: string; id: string }
  | { kind: "label"; piece: string; id: string }
  | { kind: "notch"; piece: string; id: string }
  | { kind: "grain"; piece: string; id: string }
  | null;

const TOOLS: { id: Tool; label: string; icon: typeof Move; hint: string }[] = [
  { id: "select", label: "Select", icon: MousePointer2, hint: "Click a piece or point. Drag points and handles." },
  { id: "move", label: "Move", icon: Move, hint: "Drag a piece to reposition it." },
  { id: "point", label: "Add point", icon: CirclePlus, hint: "Click an outline to insert a point." },
  { id: "line", label: "Draw line", icon: PenLine, hint: "Click to place corners of a new piece. Click the first point or press Enter to close." },
  { id: "curve", label: "Draw curve", icon: Spline, hint: "Click a point to make it a smooth curve point (click again to make it a corner)." },
  { id: "notch", label: "Add notch", icon: ChevronsDown, hint: "Click an outline to add a notch." },
  { id: "dart", label: "Add dart", icon: Triangle, hint: "Click an outline to insert a 3 cm wide, 8 cm deep dart." },
  { id: "grain", label: "Add grainline", icon: ArrowUpDown, hint: "Click inside a piece to add a 15 cm grainline." },
  { id: "fold", label: "Fold indicator", icon: FoldVertical, hint: "Click an edge to toggle it as a fold line." },
  { id: "text", label: "Add label", icon: Type, hint: "Click inside a piece to add a label." },
  { id: "delete", label: "Delete", icon: Trash2, hint: "Click an element to delete it." },
];

const PX = 10; // screen px per cm at zoom 1 (display only — not calibrated to physical scale)

export function PatternEditor({ project }: { project: Project }) {
  const h = useHistory<PatternDoc>(project.doc);
  const { doc } = h;
  const [name, setName] = useState(project.name);
  const [tool, setTool] = useState<Tool>("select");
  const [sel, setSel] = useState<Sel>(null);
  const [view, setView] = useState({ x: -5, y: -5, z: 1 });
  const [draft, setDraft] = useState<Vec[]>([]);
  const [status, setStatus] = useState<"saved" | "saving" | "failed">("saved");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<null | { mode: string; piece: string; id?: string; last: Vec; start: { x: number; y: number } }>(null);

  // ---------- autosave ----------
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setStatus("saving");
    const t = setTimeout(() => {
      try { saveProject({ ...project, name, doc }); setStatus("saved"); }
      catch { setStatus("failed"); }
    }, 700);
    return () => clearTimeout(t);
  }, [doc, name]);
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (status !== "saved") { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [status]);

  const updPiece = useCallback((id: string, fn: (p: Piece) => Piece, live = false) => {
    (live ? h.preview : h.commit)((d) => ({ ...d, pieces: d.pieces.map((p) => (p.id === id ? fn(p) : p)) }));
  }, [h.preview, h.commit]);

  const toWorld = (e: { clientX: number; clientY: number }): Vec => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: view.x + (e.clientX - r.left) / (PX * view.z), y: view.y + (e.clientY - r.top) / (PX * view.z) };
  };

  const fit = useCallback(() => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const b = bounds(doc.pieces.filter((p) => !p.hidden));
    const pad = 6;
    const z = Math.min(r.width / ((b.maxX - b.minX + pad * 2) * PX), r.height / ((b.maxY - b.minY + pad * 2) * PX));
    const w = r.width / (PX * z), hh = r.height / (PX * z);
    setView({ z, x: (b.minX + b.maxX) / 2 - w / 2, y: (b.minY + b.maxY) / 2 - hh / 2 });
  }, [doc.pieces]);
  useEffect(() => { fit(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomBy = (k: number, at?: Vec) => {
    const r = svgRef.current!.getBoundingClientRect();
    const c = at ?? { x: view.x + r.width / (2 * PX * view.z), y: view.y + r.height / (2 * PX * view.z) };
    const z = Math.min(12, Math.max(0.2, view.z * k));
    setView({ z, x: c.x - (c.x - view.x) * (view.z / z), y: c.y - (c.y - view.y) * (view.z / z) });
  };

  const selPiece = sel ? doc.pieces.find((p) => p.id === sel.piece) : undefined;

  const deleteSel = () => {
    if (!sel || !selPiece) return;
    if (sel.kind === "piece") { setConfirmDel(sel.piece); return; }
    removeElement(sel);
  };
  const removeElement = (s: NonNullable<Sel>) => {
    if (s.kind === "point") {
      updPiece(s.piece, (p) => p.points.length <= 3 ? p : ({ ...p, points: p.points.filter((q) => q.id !== s.id), folds: p.folds.filter((f) => !f.includes(s.id)) }));
    } else if (s.kind === "label") updPiece(s.piece, (p) => ({ ...p, labels: p.labels.filter((x) => x.id !== s.id) }));
    else if (s.kind === "notch") updPiece(s.piece, (p) => ({ ...p, notches: p.notches.filter((x) => x.id !== s.id) }));
    else if (s.kind === "grain") updPiece(s.piece, (p) => ({ ...p, grainlines: p.grainlines.filter((x) => x.id !== s.id) }));
    setSel(s.kind === "piece" ? null : { kind: "piece", piece: s.piece });
  };

  const closeDraft = useCallback(() => {
    if (draft.length >= 3) {
      const piece: Piece = { id: uid(), name: `Piece ${doc.pieces.length + 1}`, seam: 1, points: draft.map((v) => ({ id: uid(), ...v })), notches: [], grainlines: [], labels: [], folds: [] };
      h.commit((d) => ({ ...d, pieces: [...d.pieces, piece] }));
      setSel({ kind: "piece", piece: piece.id });
      setTool("select");
    }
    setDraft([]);
  }, [draft, doc.pieces.length, h.commit]);

  // keyboard
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? h.redo() : h.undo(); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); h.redo(); }
      else if (e.key === "Delete" || e.key === "Backspace") deleteSel();
      else if (e.key === "Enter" && tool === "line") closeDraft();
      else if (e.key === "Escape") { setDraft([]); setSel(null); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });

  // ---------- pointer handling ----------
  const hitPiece = (v: Vec) => [...doc.pieces].reverse().find((p) => !p.hidden && pointInPiece(p, v));
  const hitEdge = (v: Vec) => {
    let best: { p: Piece; r: ReturnType<typeof nearestOnOutline> } | null = null;
    for (const p of doc.pieces) {
      if (p.hidden) continue;
      const r = nearestOnOutline(p, v);
      if (!best || r.d < best.r.d) best = { p, r };
    }
    return best && best.r.d < 12 / (PX * view.z) ? best : null;
  };

  const onDown = (e: React.PointerEvent) => {
    const v = toWorld(e);
    const target = e.target as SVGElement;
    const role = target.dataset.role, pid = target.dataset.piece, eid = target.dataset.id;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);

    if (e.button === 1 || (tool === "select" && !role && !hitPiece(v))) {
      drag.current = { mode: "pan", piece: "", last: v, start: { x: e.clientX, y: e.clientY } };
      if (e.button !== 1) setSel(null);
      return;
    }
    if (tool === "delete" && role && pid) {
      if (role === "body") setConfirmDel(pid);
      else removeElement({ kind: role === "point" ? "point" : role === "label" ? "label" : role === "notch" ? "notch" : "grain", piece: pid, id: eid! } as NonNullable<Sel>);
      return;
    }
    if (tool === "line") {
      if (draft.length >= 3 && Math.hypot(draft[0].x - v.x, draft[0].y - v.y) < 10 / (PX * view.z)) closeDraft();
      else setDraft([...draft, v]);
      return;
    }
    if (tool === "curve" && role === "point" && pid) {
      updPiece(pid, (p) => {
        const i = p.points.findIndex((q) => q.id === eid);
        const q = p.points[i];
        if (q.h1 || q.h2) return { ...p, points: p.points.map((x) => (x.id === eid ? { id: x.id, x: x.x, y: x.y } : x)) };
        const a = p.points[(i - 1 + p.points.length) % p.points.length], b = p.points[(i + 1) % p.points.length];
        const t = { x: (b.x - a.x) / 6, y: (b.y - a.y) / 6 };
        return { ...p, points: p.points.map((x) => (x.id === eid ? { ...x, h1: { x: -t.x, y: -t.y }, h2: t } : x)) };
      });
      setSel({ kind: "point", piece: pid, id: eid! });
      return;
    }
    if (tool === "point" || tool === "notch" || tool === "dart" || tool === "fold") {
      const hit = hitEdge(v);
      if (!hit) return;
      const { p, r } = hit;
      if (tool === "notch") updPiece(p.id, (x) => ({ ...x, notches: [...x.notches, { id: uid(), ...r.pt }] }));
      else if (tool === "fold") {
        const a = p.points[r.seg], b = p.points[(r.seg + 1) % p.points.length];
        updPiece(p.id, (x) => {
          const has = x.folds.some((f) => f.includes(a.id) && f.includes(b.id));
          return { ...x, folds: has ? x.folds.filter((f) => !(f.includes(a.id) && f.includes(b.id))) : [...x.folds, [a.id, b.id]] };
        });
      } else {
        const a = p.points[r.seg], b = p.points[(r.seg + 1) % p.points.length];
        let ins: { id: string; x: number; y: number }[];
        if (tool === "point") ins = [{ id: uid(), ...r.pt }];
        else {
          const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
          const c = (p.points.length && signedSide(p)) as number;
          const nx = -uy * c, ny = ux * c; // inward
          ins = [
            { id: uid(), x: r.pt.x - ux * 1.5, y: r.pt.y - uy * 1.5 },
            { id: uid(), x: r.pt.x + nx * 8, y: r.pt.y + ny * 8 },
            { id: uid(), x: r.pt.x + ux * 1.5, y: r.pt.y + uy * 1.5 },
          ];
        }
        updPiece(p.id, (x) => {
          const pts = x.points.slice();
          pts.splice(r.seg + 1, 0, ...ins);
          return { ...x, points: pts };
        });
        if (tool === "point") setSel({ kind: "point", piece: p.id, id: ins[0].id });
      }
      return;
    }
    if (tool === "grain" || tool === "text") {
      const p = hitPiece(v);
      if (!p) return;
      const id = uid();
      if (tool === "grain") updPiece(p.id, (x) => ({ ...x, grainlines: [...x.grainlines, { id, x1: v.x, y1: v.y - 7.5, x2: v.x, y2: v.y + 7.5 }] }));
      else updPiece(p.id, (x) => ({ ...x, labels: [...x.labels, { id, x: v.x, y: v.y, text: "Label" }] }));
      setSel({ kind: tool === "grain" ? "grain" : "label", piece: p.id, id });
      return;
    }
    // select / move
    if (tool === "select" && pid && (role === "point" || role === "h1" || role === "h2" || role === "label")) {
      drag.current = { mode: role, piece: pid, id: eid, last: v, start: { x: e.clientX, y: e.clientY } };
      setSel(role === "label" ? { kind: "label", piece: pid, id: eid! } : { kind: "point", piece: pid, id: eid! });
      return;
    }
    if (tool === "select" && pid && (role === "notch" || role === "grain")) {
      setSel({ kind: role, piece: pid, id: eid! } as Sel);
      return;
    }
    const p = pid ? doc.pieces.find((x) => x.id === pid) : hitPiece(v);
    if (p) {
      setSel({ kind: "piece", piece: p.id });
      drag.current = { mode: "piece", piece: p.id, last: v, start: { x: e.clientX, y: e.clientY } };
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const v = toWorld(e);
    if (d.mode === "pan") {
      const r = svgRef.current!.getBoundingClientRect(); void r;
      setView((s) => ({ ...s, x: s.x - (e.movementX) / (PX * s.z), y: s.y - (e.movementY) / (PX * s.z) }));
      return;
    }
    const dx = v.x - d.last.x, dy = v.y - d.last.y;
    d.last = v;
    if (d.mode === "piece") updPiece(d.piece, (p) => translatePiece(p, dx, dy), true);
    else if (d.mode === "point") updPiece(d.piece, (p) => ({ ...p, points: p.points.map((q) => (q.id === d.id ? { ...q, x: q.x + dx, y: q.y + dy } : q)) }), true);
    else if (d.mode === "label") updPiece(d.piece, (p) => ({ ...p, labels: p.labels.map((q) => (q.id === d.id ? { ...q, x: q.x + dx, y: q.y + dy } : q)) }), true);
    else if (d.mode === "h1" || d.mode === "h2") {
      const k = d.mode, o = k === "h1" ? "h2" : "h1";
      updPiece(d.piece, (p) => ({
        ...p,
        points: p.points.map((q) => {
          if (q.id !== d.id || !q[k]) return q;
          const nh = { x: q[k]!.x + dx, y: q[k]!.y + dy };
          // keep the opposite handle collinear (smooth point) preserving its length
          const opp = q[o];
          const L = opp ? Math.hypot(opp.x, opp.y) : 0, nl = Math.hypot(nh.x, nh.y) || 1;
          return { ...q, [k]: nh, ...(opp ? { [o]: { x: (-nh.x / nl) * L, y: (-nh.y / nl) * L } } : {}) };
        }),
      }), true);
    }
  };

  const onUp = () => {
    if (drag.current && drag.current.mode !== "pan") h.endPreview();
    drag.current = null;
  };

  const onWheel = (e: React.WheelEvent) => zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, toWorld(e));

  // ---------- render ----------
  const s = 1 / view.z; // keeps strokes/handles constant on screen
  const vbW = svgRef.current ? svgRef.current.clientWidth / (PX * view.z) : 100;
  const vbH = svgRef.current ? svgRef.current.clientHeight / (PX * view.z) : 100;
  const selPoint = sel?.kind === "point" ? selPiece?.points.find((q) => q.id === sel.id) : undefined;
  const offsets = useMemo(() => new Map(doc.pieces.map((p) => [p.id, seamOffset(p)])), [doc.pieces]);

  const pieceOps = selPiece && {
    dup: () => { const c = clonePiece(selPiece); h.commit((d) => ({ ...d, pieces: [...d.pieces, c] })); setSel({ kind: "piece", piece: c.id }); },
    rot: (deg: number) => updPiece(selPiece.id, (p) => rotatePiece(p, deg)),
    mir: (a: "h" | "v") => updPiece(selPiece.id, (p) => mirrorPiece(p, a)),
    order: (dir: 1 | -1) => h.commit((d) => {
      const i = d.pieces.findIndex((p) => p.id === selPiece.id), j = i + dir;
      if (j < 0 || j >= d.pieces.length) return d;
      const arr = d.pieces.slice(); [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...d, pieces: arr };
    }),
  };

  const onRef = (f: File) => {
    const r = new FileReader();
    r.onload = () => h.commit((d) => ({ ...d, reference: String(r.result), showReference: true }));
    r.readAsDataURL(f);
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* top bar */}
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-2">
        <Link to="/" className="wordmark text-sm text-primary">stitchio</Link>
        <span className="text-border">/</span>
        <Link to="/atelier" className="text-sm text-muted-foreground hover:text-foreground">Atelier</Link>
        <span className="text-border">/</span>
        <input aria-label="Project name" value={name} onChange={(e) => setName(e.target.value)}
          className="min-w-0 rounded border border-transparent bg-transparent px-1 text-sm font-semibold hover:border-border focus:border-ring focus:outline-none" />
        <div className="ml-auto flex items-center gap-1">
          <IconBtn label="Undo (Ctrl+Z)" onClick={h.undo} disabled={!h.canUndo}><Undo2 /></IconBtn>
          <IconBtn label="Redo (Ctrl+Shift+Z)" onClick={h.redo} disabled={!h.canRedo}><Redo2 /></IconBtn>
          <Sep />
          <IconBtn label="Zoom out" onClick={() => zoomBy(1 / 1.25)}><ZoomOut /></IconBtn>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(view.z * 100)}%</span>
          <IconBtn label="Zoom in" onClick={() => zoomBy(1.25)}><ZoomIn /></IconBtn>
          <IconBtn label="Fit all pieces" onClick={fit}><Maximize /></IconBtn>
          <IconBtn label="Reset view" onClick={() => setView({ x: -5, y: -5, z: 1 })}><LocateFixed /></IconBtn>
          <Sep />
          <IconBtn label="Toggle grid" active={doc.showGrid} onClick={() => h.commit((d) => ({ ...d, showGrid: !d.showGrid }))}><Grid3x3 /></IconBtn>
          <IconBtn label="Toggle rulers" active={doc.showRulers} onClick={() => h.commit((d) => ({ ...d, showRulers: !d.showRulers }))}><Ruler /></IconBtn>
          <IconBtn label={doc.reference ? "Toggle reference image" : "Add a reference image first"} active={doc.showReference && !!doc.reference} disabled={!doc.reference}
            onClick={() => h.commit((d) => ({ ...d, showReference: !d.showReference }))}><ImageIcon /></IconBtn>
          <label className="cursor-pointer rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary">
            {doc.reference ? "Replace image" : "Add reference"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onRef(e.target.files[0])} />
          </label>
          <Sep />
          <span role="status" className={`w-24 text-right text-xs ${status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved on device" : "Save failed"}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* tools */}
        <nav aria-label="Tools" className="flex w-14 flex-col items-center gap-1 border-r border-border bg-card py-2">
          {TOOLS.map((t) => (
            <IconBtn key={t.id} label={t.label} active={tool === t.id} onClick={() => { setTool(t.id); setDraft([]); }}><t.icon /></IconBtn>
          ))}
        </nav>

        {/* canvas */}
        <div className="relative min-w-0 flex-1 bg-paper">
          <svg ref={svgRef} className={`h-full w-full touch-none select-none ${tool === "select" || tool === "move" ? "cursor-default" : "cursor-crosshair"}`}
            viewBox={`${view.x} ${view.y} ${vbW} ${vbH}`}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel}
            onDoubleClick={() => tool === "line" && closeDraft()}>
            <defs>
              <pattern id="g1" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="var(--st-border-light)" strokeWidth={0.4 * s / PX * 2} opacity="0.5" /></pattern>
              <pattern id="g10" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="url(#g1)" /><path d="M10 0H0V10" fill="none" stroke="var(--st-border-light)" strokeWidth={0.1 * s} /></pattern>
            </defs>
            {doc.showGrid && <rect x={view.x} y={view.y} width={vbW} height={vbH} fill={view.z > 0.6 ? "url(#g10)" : "none"} />}
            {doc.reference && doc.showReference && <image href={doc.reference} x={0} y={0} width={60} opacity={0.35} preserveAspectRatio="xMinYMin meet" pointerEvents="none" />}

            {doc.pieces.filter((p) => !p.hidden).map((p) => {
              const isSel = sel?.piece === p.id;
              const off = offsets.get(p.id)!;
              return (
                <g key={p.id}>
                  {off.ok && <polygon points={off.poly.map((q) => `${q.x},${q.y}`).join(" ")} fill="none" stroke="var(--st-rose)" strokeWidth={0.12 * s} strokeDasharray={`${0.6 * s} ${0.4 * s}`} pointerEvents="none" />}
                  <path d={piecePath(p)} data-role="body" data-piece={p.id} fill="var(--st-ivory)" fillOpacity={0.85}
                    stroke={isSel ? "var(--st-burgundy)" : "var(--st-ink)"} strokeWidth={(isSel ? 0.25 : 0.15) * s} />
                  {p.folds.map(([a, b]) => {
                    const A = p.points.find((q) => q.id === a), B = p.points.find((q) => q.id === b);
                    if (!A || !B) return null;
                    return <line key={a + b} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="var(--st-wine)" strokeWidth={0.35 * s} strokeDasharray={`${1.2 * s} ${0.5 * s} ${0.2 * s} ${0.5 * s}`} pointerEvents="none" />;
                  })}
                  {p.grainlines.map((g) => (
                    <g key={g.id}>
                      <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="var(--st-ink-soft)" strokeWidth={0.15 * s} markerStart="" />
                      <path d={arrow(g.x1, g.y1, g.x2, g.y2, s)} fill="var(--st-ink-soft)" pointerEvents="none" />
                      <path d={arrow(g.x2, g.y2, g.x1, g.y1, s)} fill="var(--st-ink-soft)" pointerEvents="none" />
                      <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="transparent" strokeWidth={1.2 * s} data-role="grain" data-piece={p.id} data-id={g.id} />
                    </g>
                  ))}
                  {p.notches.map((n) => (
                    <rect key={n.id} x={n.x - 0.3 * s} y={n.y - 0.3 * s} width={0.6 * s} height={0.6 * s} transform={`rotate(45 ${n.x} ${n.y})`}
                      fill={sel?.kind === "notch" && sel.id === n.id ? "var(--st-rose)" : "var(--st-burgundy)"} data-role="notch" data-piece={p.id} data-id={n.id} />
                  ))}
                  {p.labels.map((l) => (
                    <text key={l.id} x={l.x} y={l.y} fontSize={1.4 * Math.max(1, s * 0.8)} fill={sel?.kind === "label" && sel.id === l.id ? "var(--st-rose)" : "var(--st-ink)"}
                      data-role="label" data-piece={p.id} data-id={l.id} className="cursor-move">{l.text}</text>
                  ))}
                  {(isSel || tool === "curve" || tool === "delete") && p.points.map((q) => {
                    const on = sel?.kind === "point" && sel.id === q.id;
                    return (
                      <g key={q.id}>
                        {on && q.h1 && <Handle q={q} k="h1" s={s} pid={p.id} />}
                        {on && q.h2 && <Handle q={q} k="h2" s={s} pid={p.id} />}
                        <circle cx={q.x} cy={q.y} r={(on ? 0.55 : 0.4) * s} data-role="point" data-piece={p.id} data-id={q.id}
                          fill={on ? "var(--st-rose)" : q.h1 || q.h2 ? "var(--st-paper)" : "var(--st-burgundy)"} stroke="var(--st-burgundy)" strokeWidth={0.12 * s} className="cursor-pointer" />
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {draft.length > 0 && (
              <g pointerEvents="none">
                <polyline points={draft.map((q) => `${q.x},${q.y}`).join(" ")} fill="none" stroke="var(--st-rose)" strokeWidth={0.2 * s} />
                {draft.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={0.4 * s} fill={i === 0 ? "var(--st-rose)" : "var(--st-burgundy)"} />)}
              </g>
            )}
          </svg>

          {doc.showRulers && <Rulers view={view} />}
          <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border bg-card/90 px-4 py-1.5 text-xs text-muted-foreground">
            {TOOLS.find((t) => t.id === tool)!.hint} · Scroll to zoom, drag empty paper to pan
          </p>
        </div>

        {/* properties */}
        <aside aria-label="Properties" className="w-72 overflow-y-auto border-l border-border bg-card p-4 text-sm">
          {!selPiece && (
            <div className="space-y-3 text-muted-foreground">
              <h2 className="font-semibold text-foreground">Pieces</h2>
              <ul className="space-y-1">
                {doc.pieces.map((p) => (
                  <li key={p.id}><button className="w-full rounded px-2 py-1 text-left hover:bg-secondary" onClick={() => setSel({ kind: "piece", piece: p.id })}>{p.name}</button></li>
                ))}
              </ul>
              <p className="text-xs">Units: centimetres. On-screen size is not calibrated to physical scale. Starter pieces are illustrative, not a validated sewing pattern.</p>
            </div>
          )}
          {selPiece && pieceOps && (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{sel!.kind === "piece" ? "Pattern piece" : sel!.kind}</p>
                <Field label="Name"><input className="inp" value={selPiece.name} onChange={(e) => updPiece(selPiece.id, (p) => ({ ...p, name: e.target.value }))} /></Field>
              </div>
              <Dims p={selPiece} />
              <Field label="Seam allowance (cm)">
                <input className="inp" type="number" min={0} step={0.1} value={selPiece.seam}
                  onChange={(e) => updPiece(selPiece.id, (p) => ({ ...p, seam: Math.max(0, Number(e.target.value) || 0) }))} />
              </Field>
              {(() => { const o = offsets.get(selPiece.id)!; return !o.ok && selPiece.seam > 0 ? <p className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">Seam allowance not drawn: {o.reason}.</p> : null; })()}

              {selPoint && (
                <div className="space-y-2 rounded border border-border p-3">
                  <p className="font-semibold">Point</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="X (cm)"><input className="inp" type="number" step={0.1} value={round(selPoint.x)} onChange={(e) => updPiece(selPiece.id, (p) => ({ ...p, points: p.points.map((q) => q.id === selPoint.id ? { ...q, x: Number(e.target.value) } : q) }))} /></Field>
                    <Field label="Y (cm)"><input className="inp" type="number" step={0.1} value={round(selPoint.y)} onChange={(e) => updPiece(selPiece.id, (p) => ({ ...p, points: p.points.map((q) => q.id === selPoint.id ? { ...q, y: Number(e.target.value) } : q) }))} /></Field>
                  </div>
                  <p className="text-xs text-muted-foreground">{selPoint.h1 || selPoint.h2 ? "Curve point — drag the round handles." : "Corner point — use Draw curve to smooth it."}</p>
                  <button className="btn-ghost text-destructive" disabled={selPiece.points.length <= 3} onClick={() => removeElement(sel!)}>Remove point</button>
                </div>
              )}
              {sel?.kind === "label" && (() => { const l = selPiece.labels.find((x) => x.id === sel.id); return l && (
                <Field label="Label text"><input className="inp" value={l.text} onChange={(e) => updPiece(selPiece.id, (p) => ({ ...p, labels: p.labels.map((x) => x.id === l.id ? { ...x, text: e.target.value } : x) }))} /></Field>
              ); })()}
              {(sel?.kind === "notch" || sel?.kind === "grain" || sel?.kind === "label") && <button className="btn-ghost text-destructive" onClick={() => removeElement(sel!)}>Delete {sel.kind}</button>}

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Operations</p>
                <div className="grid grid-cols-2 gap-2">
                  <Op onClick={pieceOps.dup}><Copy /> Duplicate</Op>
                  <Op onClick={() => pieceOps.rot(15)}><RotateCw /> Rotate 15°</Op>
                  <Op onClick={() => pieceOps.mir("h")}><FlipHorizontal2 /> Mirror ↔</Op>
                  <Op onClick={() => pieceOps.mir("v")}><FlipVertical2 /> Mirror ↕</Op>
                  <Op onClick={() => pieceOps.order(1)}><ArrowUp /> Bring forward</Op>
                  <Op onClick={() => pieceOps.order(-1)}><ArrowDown /> Send back</Op>
                </div>
                <RotateInput onApply={(d) => pieceOps.rot(d)} />
                <Op danger onClick={() => setConfirmDel(selPiece.id)}><Trash2 /> Delete piece</Op>
              </div>
            </div>
          )}
        </aside>
      </div>

      {confirmDel && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40">
          <div className="w-80 rounded-lg border border-border bg-card p-5 shadow-xl">
            <p className="font-semibold">Delete “{doc.pieces.find((p) => p.id === confirmDel)?.name}”?</p>
            <p className="mt-1 text-sm text-muted-foreground">Its notches, grainlines and labels are removed too. You can undo this.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="rounded bg-destructive px-3 py-1.5 text-sm text-destructive-foreground"
                onClick={() => { const id = confirmDel; h.commit((d) => ({ ...d, pieces: d.pieces.filter((p) => p.id !== id) })); setSel(null); setConfirmDel(null); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function signedSide(p: Piece) {
  let s = 0;
  for (let i = 0; i < p.points.length; i++) { const a = p.points[i], b = p.points[(i + 1) % p.points.length]; s += a.x * b.y - b.x * a.y; }
  return s > 0 ? 1 : -1;
}
const round = (n: number) => Math.round(n * 10) / 10;
function arrow(x1: number, y1: number, x2: number, y2: number, s: number) {
  const a = Math.atan2(y2 - y1, x2 - x1), L = 1 * s, W = 0.45 * s;
  const bx = x2 - Math.cos(a) * L, by = y2 - Math.sin(a) * L;
  return `M${x2},${y2} L${bx - Math.sin(a) * W},${by + Math.cos(a) * W} L${bx + Math.sin(a) * W},${by - Math.cos(a) * W} Z`;
}

function Handle({ q, k, s, pid }: { q: { id: string; x: number; y: number; h1?: Vec; h2?: Vec }; k: "h1" | "h2"; s: number; pid: string }) {
  const h = q[k]!;
  return (
    <>
      <line x1={q.x} y1={q.y} x2={q.x + h.x} y2={q.y + h.y} stroke="var(--st-rose)" strokeWidth={0.1 * s} pointerEvents="none" />
      <circle cx={q.x + h.x} cy={q.y + h.y} r={0.4 * s} fill="var(--st-paper)" stroke="var(--st-rose)" strokeWidth={0.12 * s} data-role={k} data-piece={pid} data-id={q.id} className="cursor-pointer" />
    </>
  );
}

function Rulers({ view }: { view: { x: number; y: number; z: number } }) {
  const step = view.z > 2 ? 1 : view.z > 0.6 ? 5 : 10;
  const ticks = (o: number) => Array.from({ length: 200 }, (_, i) => Math.ceil(o / step) * step + i * step);
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-5 overflow-hidden border-b border-border bg-card/90 text-[9px] text-muted-foreground">
        {ticks(view.x).map((t) => (
          <span key={t} className="absolute top-0 h-full border-l border-border pl-0.5" style={{ left: (t - view.x) * PX * view.z }}>{t % (step * 2) === 0 ? t : ""}</span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-5 overflow-hidden border-r border-border bg-card/90 text-[9px] text-muted-foreground">
        {ticks(view.y).map((t) => (
          <span key={t} className="absolute left-0 w-full border-t border-border pl-0.5" style={{ top: (t - view.y) * PX * view.z }}>{t % (step * 2) === 0 ? t : ""}</span>
        ))}
      </div>
      <span className="pointer-events-none absolute left-0 top-0 z-10 flex h-5 w-5 items-center justify-center bg-card text-[8px] text-muted-foreground">cm</span>
    </>
  );
}

function Dims({ p }: { p: Piece }) {
  const b = bounds([p]);
  return <p className="text-xs text-muted-foreground">Size: {round(b.maxX - b.minX)} × {round(b.maxY - b.minY)} cm · {p.points.length} points</p>;
}
function RotateInput({ onApply }: { onApply: (d: number) => void }) {
  const [v, setV] = useState(90);
  return (
    <div className="flex gap-2">
      <input aria-label="Rotation degrees" className="inp" type="number" value={v} onChange={(e) => setV(Number(e.target.value))} />
      <button className="btn-ghost whitespace-nowrap" onClick={() => onApply(v)}>Rotate °</button>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-1 block space-y-1"><span className="text-xs text-muted-foreground">{label}</span>{children}</label>;
}
function Op({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={`flex w-full items-center gap-1.5 rounded border border-border px-2 py-1.5 text-xs hover:bg-secondary [&_svg]:size-3.5 ${danger ? "text-destructive" : ""}`}>{children}</button>;
}
function IconBtn({ children, label, onClick, active, disabled }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button aria-label={label} title={label} aria-pressed={active} disabled={disabled} onClick={onClick}
      className={`flex size-9 items-center justify-center rounded-md transition-colors disabled:opacity-35 [&_svg]:size-4 ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
      {children}
    </button>
  );
}
const Sep = () => <span className="mx-1 h-5 w-px bg-border" />;
