import { describe, expect, it } from "vitest";
import { mirrorPiece, seamOffset, starterDoc, type Piece } from "@/lib/pattern/geometry";

const square = (seam: number): Piece => ({
  id: "s", name: "sq", seam, notches: [], grainlines: [], labels: [], folds: [],
  points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 }, { id: "c", x: 10, y: 10 }, { id: "d", x: 0, y: 10 }],
});

describe("seam allowance", () => {
  it("offsets a 10cm square outward by 1cm on every side", () => {
    const r = seamOffset(square(1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const xs = r.poly.map((p) => p.x), ys = r.poly.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(-1);
    expect(Math.max(...xs)).toBeCloseTo(11);
    expect(Math.min(...ys)).toBeCloseTo(-1);
    expect(Math.max(...ys)).toBeCloseTo(11);
  });
  it("refuses to draw an allowance for a self-crossing outline", () => {
    const p = square(1);
    p.points = [p.points[0], p.points[2], p.points[1], p.points[3]];
    expect(seamOffset(p).ok).toBe(false);
  });
  it("produces an allowance for the starter pieces", () => {
    for (const p of starterDoc().pieces) expect(seamOffset(p).ok).toBe(true);
  });
  it("mirroring keeps the allowance valid", () => {
    for (const p of starterDoc().pieces) expect(seamOffset(mirrorPiece(p, "h")).ok).toBe(true);
  });
});
