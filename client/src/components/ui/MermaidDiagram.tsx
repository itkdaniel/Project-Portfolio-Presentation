import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";
import { Loader2 } from "lucide-react";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  darkMode: true,
  themeVariables: {
    primaryColor: "#3B82F6",
    primaryTextColor: "#f8fafc",
    primaryBorderColor: "#1e40af",
    lineColor: "#475569",
    secondaryColor: "#1e293b",
    tertiaryColor: "#0f172a",
    background: "#0f172a",
    mainBkg: "#1e293b",
    nodeBorder: "#334155",
    clusterBkg: "#0f172a",
    titleColor: "#f8fafc",
    edgeLabelBackground: "#1e293b",
    attributeBackgroundColorEven: "#0f172a",
    attributeBackgroundColorOdd: "#1e293b",
  },
  er: { diagramPadding: 20, layoutDirection: "TB", minEntityWidth: 100, minEntityHeight: 75, entityPadding: 15, useMaxWidth: true },
  flowchart: { diagramPadding: 16, htmlLabels: true, curve: "basis", useMaxWidth: true },
});

interface Props {
  code: string;
  className?: string;
}

export function MermaidDiagram({ code, className = "" }: Props) {
  const rawId = useId();
  const id = `md-${rawId.replace(/:/g, "").replace(/-/g, "")}`;
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSvg("");
    mermaid.render(id, code)
      .then(({ svg: rendered }) => { setSvg(rendered); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [code, id]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <div className={`bg-red-500/5 border border-red-500/20 rounded-lg p-4 ${className}`}>
        <pre className="text-red-400 text-xs font-mono whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }
  return (
    <div
      className={`mermaid-wrapper overflow-x-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
