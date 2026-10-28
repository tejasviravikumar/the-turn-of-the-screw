import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { deleteProject, listProjects, piecesPreview, type Project } from "@/lib/pattern/projects";

export const Route = createFileRoute("/atelier")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your Atelier — Stitchio" },
      { name: "description", content: "Browse and reopen the patterns you've shaped in Stitchio." },
      { property: "og:title", content: "Your Atelier — Stitchio" },
      { property: "og:description", content: "Browse and reopen your Stitchio patterns." },
    ],
  }),
  component: Atelier,
});

function Atelier() {
  const [items, setItems] = useState<Project[]>([]);
  useEffect(() => setItems(listProjects()), []);
  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link to="/" className="wordmark text-primary">stitchio</Link>
        <Link to="/editor" search={{ id: undefined }} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-wine">New pattern</Link>
      </header>
      <section className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-light">Your atelier</h1>
        <p className="mt-1 text-sm text-muted-foreground">Patterns are saved on this device only.</p>
        {items.length === 0 ? (
          <div className="mt-10 rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
            No patterns yet. <Link to="/editor" search={{ id: undefined }} className="font-semibold text-primary underline">Start your first one</Link>.
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-lg border border-border bg-card">
                <Link to="/editor" search={{ id: p.id }} className="block">
                  <svg viewBox={piecesPreview(p).vb} className="h-40 w-full bg-paper p-3">
                    {piecesPreview(p).paths.map((d, i) => <path key={i} d={d} fill="var(--st-ivory)" stroke="var(--st-ink)" strokeWidth={0.3} />)}
                  </svg>
                  <div className="px-4 py-3">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.doc.pieces.length} pieces · edited {new Date(p.updatedAt).toLocaleString()}</p>
                  </div>
                </Link>
                <button className="m-3 mt-0 text-xs text-destructive hover:underline"
                  onClick={() => { if (confirm(`Delete “${p.name}”?`)) { deleteProject(p.id); setItems(listProjects()); } }}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
