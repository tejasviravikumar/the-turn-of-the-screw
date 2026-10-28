import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { TOTAL } from "@/components/landing/timeline";

const AtelierScene = lazy(() => import("@/components/landing/AtelierScene").then((m) => ({ default: m.AtelierScene })));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stitchio — Your ideas. Your fit. Your pattern." },
      { name: "description", content: "Turn garment inspiration into patterns you can shape, refine, and make your own." },
      { property: "og:title", content: "Stitchio — Your ideas. Your fit. Your pattern." },
      { property: "og:description", content: "A couture-inspired atelier for shaping your own garment patterns." },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { n: "01", t: "Trace", d: "Begin with a garment reference." },
  { n: "02", t: "Shape", d: "Edit the pattern and personalize measurements." },
  { n: "03", t: "Make", d: "Preview the design and prepare your pattern for export." },
];

function Landing() {
  const [mounted, setMounted] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [t, setT] = useState(0);
  const [startAt, setStartAt] = useState(0);
  const [run, setRun] = useState(0);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const c = document.createElement("canvas");
      setWebgl(!!(c.getContext("webgl2") || c.getContext("webgl")));
    } catch { setWebgl(false); }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setStartAt(TOTAL); setT(TOTAL); }
  }, []);

  const skip = () => { setInteractive(false); setStartAt(TOTAL); setT(TOTAL); setRun((r) => r + 1); };
  const replay = () => { setInteractive(false); setStartAt(0); setT(0); setRun((r) => r + 1); };
  const brand = t >= 16 || !webgl;

  return (
    <div className="atelier-dark">
      <section className="film-grain relative h-[100svh] w-full overflow-hidden" aria-label="Stitchio introduction">
        {mounted && webgl && (
          <div className="absolute inset-0">
            <Suspense fallback={null}>
              <AtelierScene key={run} startAt={startAt} playing={!interactive} interactive={interactive}
                onTick={setT} onInteract={() => t >= 0.3 && setInteractive(true)} />
            </Suspense>
          </div>
        )}

        <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-5 md:px-10">
          <span className={`wordmark text-sm text-champagne reveal-soft ${t > 0.5 ? "opacity-100" : "opacity-0"}`}>stitchio</span>
          <div className="pointer-events-auto flex gap-2 text-xs">
            {webgl && (t < TOTAL - 0.1 && !interactive
              ? <button onClick={skip} className="rounded-full border border-line-dark px-4 py-1.5 text-mauve hover:text-ivory">Skip intro</button>
              : <button onClick={replay} className="rounded-full border border-line-dark px-4 py-1.5 text-mauve hover:text-ivory">Replay</button>)}
            <Link to="/atelier" className="rounded-full border border-line-dark px-4 py-1.5 text-mauve hover:text-ivory">Atelier</Link>
          </div>
        </header>

        <div className={`absolute inset-x-0 bottom-0 z-10 px-6 pb-12 md:inset-y-0 md:left-0 md:right-auto md:flex md:max-w-xl md:flex-col md:justify-center md:pb-0 md:pl-16 reveal-soft ${brand ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}>
          <p className="wordmark text-4xl text-ivory md:text-6xl">stitchio</p>
          <h1 className="mt-6 text-2xl font-light leading-snug text-ivory md:text-4xl">Your ideas. Your fit. Your pattern.</h1>
          <p className="mt-4 max-w-sm text-sm text-mauve md:text-base">Turn garment inspiration into patterns you can shape, refine, and make your own.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/editor" search={{ id: undefined }} className="rounded-full bg-champagne px-6 py-3 text-sm font-semibold text-studio transition hover:bg-ivory">Create a Pattern</Link>
            <Link to="/atelier" className="rounded-full border border-rose-taupe/50 px-6 py-3 text-sm text-ivory transition hover:border-champagne">Explore the Atelier</Link>
          </div>
        </div>

        {interactive && <p className="absolute bottom-4 right-6 z-10 text-xs text-mauve">Drag to look around</p>}
      </section>

      <section className="border-t border-line-dark bg-wine-shadow px-6 py-20 md:px-16">
        <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.t} className="border-l border-line-dark pl-5">
              <span className="text-xs tracking-widest text-rose">{f.n}</span>
              <h2 className="mt-2 text-2xl font-light text-ivory">{f.t}</h2>
              <p className="mt-2 text-sm text-mauve">{f.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
