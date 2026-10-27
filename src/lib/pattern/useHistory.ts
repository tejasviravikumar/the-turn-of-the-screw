import { useCallback, useRef, useState } from "react";

/** Undo/redo container. `preview` changes state without an undo entry (used while dragging);
 *  `commit` records one entry using the state from before the preview began. */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const dragBase = useRef<T | null>(null);

  const commit = useCallback((fn: (s: T) => T) => {
    setState((h) => {
      const base = dragBase.current ?? h.present;
      dragBase.current = null;
      const next = fn(h.present);
      if (next === base) return h;
      return { past: [...h.past, base].slice(-200), present: next, future: [] };
    });
  }, []);

  const preview = useCallback((fn: (s: T) => T) => {
    setState((h) => {
      if (dragBase.current === null) dragBase.current = h.present;
      return { ...h, present: fn(h.present) };
    });
  }, []);

  const endPreview = useCallback(() => commit((s) => s), []);

  const undo = useCallback(() => {
    setState((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h));
  }, []);
  const redo = useCallback(() => {
    setState((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h));
  }, []);
  const reset = useCallback((v: T) => setState({ past: [], present: v, future: [] }), []);

  return { doc: state.present, canUndo: state.past.length > 0, canRedo: state.future.length > 0, commit, preview, endPreview, undo, redo, reset };
}
