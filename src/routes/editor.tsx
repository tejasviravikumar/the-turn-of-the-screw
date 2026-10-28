import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PatternEditor } from "@/components/editor/PatternEditor";
import { createProject, getProject, type Project } from "@/lib/pattern/projects";

export const Route = createFileRoute("/editor")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ id: typeof s.id === "string" ? s.id : undefined }),
  head: () => ({
    meta: [
      { title: "Pattern Editor — Stitchio" },
      { name: "description", content: "Shape pattern pieces, curves, darts, notches and seam allowances in the Stitchio editor." },
      { property: "og:title", content: "Pattern Editor — Stitchio" },
      { property: "og:description", content: "Edit garment pattern pieces with curves, darts and seam allowances." },
    ],
  }),
  component: EditorPage,
});

function EditorPage() {
  const { id } = Route.useSearch();
  const nav = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  useEffect(() => {
    const p = id ? getProject(id) : undefined;
    if (p) setProject(p);
    else {
      const n = createProject();
      nav({ to: "/editor", search: { id: n.id }, replace: true });
      setProject(n);
    }
  }, [id]);
  if (!project) return <div className="p-8 text-muted-foreground">Opening pattern…</div>;
  return <PatternEditor key={project.id} project={project} />;
}
