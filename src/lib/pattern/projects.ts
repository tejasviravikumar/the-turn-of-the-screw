import { starterDoc, uid, type PatternDoc } from "./geometry";

// Projects are stored on this device (localStorage). No cloud sync yet.
export type Project = { id: string; name: string; updatedAt: number; doc: PatternDoc };
const KEY = "stitchio:projects";

export function listProjects(): Project[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function getProject(id: string) {
  return listProjects().find((p) => p.id === id);
}

/** Throws if storage is full/unavailable so callers can show "Save failed". */
export function saveProject(p: Project) {
  const all = listProjects().filter((x) => x.id !== p.id);
  all.unshift({ ...p, updatedAt: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function createProject(name = "Untitled pattern"): Project {
  const p = { id: uid(), name, updatedAt: Date.now(), doc: starterDoc() };
  saveProject(p);
  return p;
}

export function deleteProject(id: string) {
  localStorage.setItem(KEY, JSON.stringify(listProjects().filter((p) => p.id !== id)));
}

import { bounds, piecePath } from "./geometry";
export function piecesPreview(p: Project) {
  const b = bounds(p.doc.pieces);
  return { vb: `${b.minX - 2} ${b.minY - 2} ${b.maxX - b.minX + 4} ${b.maxY - b.minY + 4}`, paths: p.doc.pieces.map(piecePath) };
}
