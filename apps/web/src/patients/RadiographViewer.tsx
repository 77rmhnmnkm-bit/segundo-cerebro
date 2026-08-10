import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { FileAnnotation, PatientFile } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import type { DetectionLearning } from "../api";
import { API_URL, aiDescribeFile, aiDetectFile, createOdontogramEntry, recordDetectionFeedback, saveFileAnnotations, updatePatientFile } from "../api";

const RTYPES: { value: string; label: string }[] = [
  { value: "panoramica", label: "Panorâmica" },
  { value: "bitewing", label: "Bitewing" },
  { value: "periapical", label: "Periapical" },
  { value: "foto", label: "Foto clínica" },
];

type Tool = "rect" | "circle" | "arrow" | "text" | "freehand" | "measure";

function parseConfidence(label?: string): number | undefined {
  const m = label?.match(/(\d{1,3})%/);
  return m ? Number(m[1]) / 100 : undefined;
}

// Rótulo sem o sufixo de confiança ("Restauração 38%" -> "Restauração").
function baseLabel(label?: string): string {
  return (label ?? "").replace(/\s*\d{1,3}%\s*$/, "").trim();
}
type StampKind = NonNullable<FileAnnotation["stamp"]>;

const COLORS = ["#FF3B30", "#FFCC00", "#34C759", "#0A84FF", "#AF52DE", "#FF9500"];
const STROKE = 2.6; // px (non-scaling) — grosso o bastante para ver na radiografia

// Contornos de anatomia (estilo DIO): o profissional desenha ao redor da
// estrutura e fica rotulada. Não é detecção automática — é traçado manual,
// editável e apagável, para explicar ao paciente.
const ANATOMY: { label: string; color: string; line?: boolean }[] = [
  // Contornos de dentes e achados (estilo DIO) — cores fixas por significado.
  { label: "Dente", color: "#2D7DFF" },
  { label: "Cárie", color: "#FF3B30" },
  { label: "Restauração", color: "#00C2D1" },
  // Anatomia.
  { label: "Seio maxilar", color: "#FF9F0A" },
  { label: "Canal mandibular", color: "#A3E635" },
  { label: "Fossa nasal", color: "#64D2FF" },
  { label: "Forame mentual", color: "#BF5AF2" },
  { label: "ATM", color: "#5E5CE6" },
  { label: "Borda / mandíbula", color: "#FF2D9A" },
  // Traçados em LINHA (estrutura linear) — não fecham em polígono.
  { label: "Nível ósseo", color: "#FFD60A", line: true },
  { label: "Linha gengival (foto)", color: "#FF2D55", line: true },
];

const ODONTO_STATUS: { value: string; label: string }[] = [
  { value: "carie", label: "Cárie" },
  { value: "restaurado", label: "Restaurado" },
  { value: "endodontia", label: "Endodontia" },
  { value: "implante", label: "Implante" },
  { value: "ausente", label: "Ausente" },
  { value: "saudavel", label: "Saudável" },
];

// Mapeia o rótulo de um achado (IA ou manual) para um status de odontograma +
// nome de procedimento, como melhor palpite — sempre editável pelo profissional
// antes de salvar. Remove o sufixo de confiança ("Restauração 36%" -> base).
function mapFindingToOdonto(label: string): { status: string; procedure: string } {
  const base = label.replace(/\s*\d{1,3}%\s*$/, "").trim();
  const l = base.toLowerCase();
  if (l.includes("profunda") || l.includes("deep")) return { status: "carie", procedure: "Cárie profunda" };
  if (l.includes("cárie") || l.includes("carie") || l.includes("caries")) return { status: "carie", procedure: "Cárie" };
  if (l.includes("restaura") || l.includes("filling")) return { status: "restaurado", procedure: "Restauração" };
  if (l.includes("coroa") || l.includes("crown")) return { status: "restaurado", procedure: "Coroa" };
  if (l.includes("implante") || l.includes("implant")) return { status: "implante", procedure: "Implante" };
  if (l.includes("canal") || l.includes("obtura") || l.includes("root canal") || l.includes("endod"))
    return { status: "endodontia", procedure: "Tratamento endodôntico" };
  if (l.includes("ausente") || l.includes("missing")) return { status: "ausente", procedure: "Dente ausente" };
  if (l.includes("periapical") || l.includes("lesão")) return { status: "endodontia", procedure: "Lesão periapical (avaliar)" };
  if (l.includes("raiz") || l.includes("root")) return { status: "carie", procedure: "Raiz residual (avaliar)" };
  return { status: "carie", procedure: base || "Achado radiográfico" };
}

// Cor por tipo de achado detectado, para diferenciar visualmente (igual DIO).
function colorForLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("cárie profunda") || l.includes("deep")) return "#B91C1C";
  if (l.includes("cárie") || l.includes("caries")) return "#FF3B30";
  if (l.includes("restaura") || l.includes("filling")) return "#0A84FF";
  if (l.includes("coroa") || l.includes("crown")) return "#AF52DE";
  if (l.includes("implante") || l.includes("implant")) return "#0FB5A8";
  if (l.includes("periapical") || l.includes("lesão")) return "#FF9500";
  if (l.includes("canal") || l.includes("obtura") || l.includes("root canal")) return "#00C2D1";
  if (l.includes("raiz") || l.includes("root")) return "#EC4899";
  if (l.includes("ausente") || l.includes("missing")) return "#8E8E93";
  return "#FFCC00";
}

const STAMPS: { kind: StampKind; label: string; color: string }[] = [
  { kind: "implante", label: "Implante", color: "#0FB5A8" },
  { kind: "coroa", label: "Coroa", color: "#AF52DE" },
  { kind: "protese", label: "Prótese/Ponte", color: "#0A84FF" },
  { kind: "extracao", label: "Extração", color: "#FF3B30" },
  { kind: "aparelho", label: "Aparelho", color: "#34C759" },
];

const DRAW_TOOLS: { id: Tool; glyph: string; label: string }[] = [
  { id: "rect", glyph: "▭", label: "Caixa" },
  { id: "circle", glyph: "◯", label: "Círculo" },
  { id: "arrow", glyph: "➜", label: "Seta" },
  { id: "text", glyph: "T", label: "Texto" },
  { id: "freehand", glyph: "✎", label: "Contorno" },
  { id: "measure", glyph: "📏", label: "Medir" },
];

// Negatoscópio + comunicação visual com paciente, inspirado no DIO: a
// radiografia ocupa a tela; o profissional marca achados (cores por tipo) e
// arrasta "carimbos" de tratamento (implante, coroa...) sobre o dente para
// mostrar ao paciente o que será feito. Coordenadas em 0-1.
export function RadiographViewer({ file, onClose, onSaved }: { file: PatientFile; onClose: () => void; onSaved: () => void }) {
  const { theme } = useTheme();
  const [tool, setTool] = useState<Tool>("rect");
  const [calibrating, setCalibrating] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [pendingStamp, setPendingStamp] = useState<StampKind | null>(null);
  const [annotations, setAnnotations] = useState<FileAnnotation[]>(file.annotations ?? []);
  const [draft, setDraft] = useState<FileAnnotation | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [bright, setBright] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState<string | null>(file.ai_description ?? null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);
  const [anatomyLabel, setAnatomyLabel] = useState<string | null>(null);
  const [anatomyLine, setAnatomyLine] = useState(false);
  const [showOdonto, setShowOdonto] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);
  const [learning, setLearning] = useState<DetectionLearning | null>(null);
  // Bitewing/periapical são close-up: cárie pede mais sensibilidade que panorâmica.
  const closeUp = file.radiograph_type === "bitewing" || file.radiograph_type === "periapical";
  const [sensitivity, setSensitivity] = useState(closeUp ? 0.12 : 0.25); // limiar de confiança da IA
  const [hiddenLabels, setHiddenLabels] = useState<Set<string>>(new Set());
  const [rtype, setRtype] = useState<string | null>(file.radiograph_type ?? null);
  const [cariesFocus, setCariesFocus] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const panStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  function relCoords(e: React.MouseEvent) {
    // Coordenadas relativas à IMAGEM (reflete zoom/pan via getBoundingClientRect).
    const rect = (imgRef.current ?? surfaceRef.current!).getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function handleDown(e: React.MouseEvent) {
    // Modo mover (mão): arrasta a imagem ampliada.
    if (panMode) {
      panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      return;
    }
    const { x, y } = relCoords(e);
    // Modo "carimbo": coloca o tratamento onde clicar e sai do modo.
    if (pendingStamp) {
      const s = STAMPS.find((st) => st.kind === pendingStamp)!;
      setAnnotations((prev) => [...prev, { type: "stamp", stamp: pendingStamp, x, y, color: s.color, label: s.label, scale: 1 }]);
      setPendingStamp(null);
      return;
    }
    if (tool === "text") {
      const label = prompt("Texto da marcação:");
      if (!label) return;
      setAnnotations((prev) => [...prev, { type: "text", x, y, color, label, origin: "manual" }]);
      return;
    }
    if (tool === "freehand") {
      // Contorno livre de anatomia — começa a coletar pontos (linha ou polígono).
      setDraft({ type: "freehand", x, y, color, points: [{ x, y }], label: anatomyLabel ?? undefined, origin: "manual", openLine: anatomyLine });
      return;
    }
    setDraft({ type: tool, x, y, w: 0, h: 0, x2: x, y2: y, color, origin: "manual" });
  }

  function handleMove(e: React.MouseEvent) {
    if (panStart.current) {
      setPan({ x: panStart.current.px + (e.clientX - panStart.current.x), y: panStart.current.py + (e.clientY - panStart.current.y) });
      return;
    }
    if (dragIdx !== null) {
      const { x, y } = relCoords(e);
      setAnnotations((prev) => prev.map((a, i) => (i === dragIdx ? { ...a, x, y } : a)));
      return;
    }
    if (!draft) return;
    const { x, y } = relCoords(e);
    if (draft.type === "freehand") {
      const pts = draft.points ?? [];
      const last = pts[pts.length - 1];
      // Amostra: só adiciona ponto se andou o suficiente (evita arrays enormes).
      if (!last || Math.hypot(x - last.x, y - last.y) > 0.004) {
        setDraft({ ...draft, points: [...pts, { x, y }] });
      }
      return;
    }
    setDraft({ ...draft, w: x - draft.x, h: y - draft.y, x2: x, y2: y });
  }

  function handleUp() {
    if (panStart.current) {
      panStart.current = null;
      return;
    }
    if (dragIdx !== null) {
      setDragIdx(null);
      return;
    }
    if (!draft) return;
    if (draft.type === "freehand") {
      if ((draft.points?.length ?? 0) > 2) setAnnotations((prev) => [...prev, draft]);
      setDraft(null);
      return;
    }
    const big = Math.abs(draft.w ?? 0) > 0.01 || Math.abs(draft.h ?? 0) > 0.01;
    if (draft.type === "measure") {
      if (big) {
        if (calibrating) {
          const v = prompt("Distância real desta linha, em milímetros (calibração):");
          const mm = v ? Number(v.replace(",", ".")) : NaN;
          setCalibrating(false);
          if (mm > 0) {
            // remove calibração anterior e marca esta como referência de escala
            setAnnotations((prev) => prev.filter((a) => !a.calibration).concat({ ...draft, calibration: true, mm, color: "#FFD60A" }));
            setDraft(null);
            return;
          }
        }
        setAnnotations((prev) => [...prev, draft]);
      }
      setDraft(null);
      return;
    }
    if (big) setAnnotations((prev) => [...prev, draft]);
    setDraft(null);
  }

  function removeAt(i: number) {
    setAnnotations((prev) => prev.filter((_, idx) => idx !== i));
  }

  function resizeStamp(i: number, factor: number) {
    setAnnotations((prev) => prev.map((a, idx) => (idx === i ? { ...a, scale: Math.max(0.4, Math.min(3, (a.scale ?? 1) * factor)) } : a)));
  }

  function zoomBy(factor: number) {
    setZoom((z) => {
      const nz = Math.max(1, Math.min(6, z * factor));
      if (nz === 1) setPan({ x: 0, y: 0 });
      return nz;
    });
  }
  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }
  function handleWheel(e: React.WheelEvent) {
    if (e.deltaY === 0) return;
    zoomBy(e.deltaY < 0 ? 1.12 : 0.89);
  }

  // Confirmar um achado da IA (✓) — marca como confirmado e ENSINA a IA
  // (feedback positivo daquela classe, usado na calibração de ai-detect).
  function confirmFinding(i: number) {
    const a = annotations[i];
    if (!a) return;
    setAnnotations((prev) => prev.map((x, idx) => (idx === i ? { ...x, confirmed: true } : x)));
    recordDetectionFeedback(file.id, {
      label: a.label ?? "",
      action: "confirm",
      confidence: parseConfidence(a.label),
      x: a.x,
      y: a.y,
      w: a.w,
      h: a.h,
    }).catch(() => {});
  }
  // Rejeitar (✕) — remove e ensina a IA (feedback negativo).
  function rejectFinding(i: number) {
    const a = annotations[i];
    if (a?.origin === "ia") {
      recordDetectionFeedback(file.id, {
        label: a.label ?? "",
        action: "reject",
        confidence: parseConfidence(a.label),
        x: a.x,
        y: a.y,
        w: a.w,
        h: a.h,
      }).catch(() => {});
    }
    removeAt(i);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveFileAnnotations(file.id, annotations);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleAi() {
    setAiLoading(true);
    setAiError(null);
    try {
      const { description } = await aiDescribeFile(file.id);
      setAiText(description);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Falha na análise.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleDetect() {
    setDetecting(true);
    setDetectMsg(null);
    setAiError(null);
    try {
      const { detections, learning } = await aiDetectFile(file.id, sensitivity);
      setLearning(learning ?? null);
      setHiddenLabels(new Set());
      if (detections.length === 0) {
        setDetectMsg("Nenhum achado sugerido pela IA nesta imagem.");
      } else {
        setAnnotations((prev) => [
          ...prev,
          ...detections.map((d) => {
            const label = `${d.label} ${Math.round(d.confidence * 100)}%`;
            const color = colorForLabel(d.label);
            // Com contorno de segmentação: desenha o polígono (linha em volta da
            // extensão). Sem contorno: cai na caixa.
            if (d.points && d.points.length >= 3) {
              // âncora do rótulo no ponto mais alto do contorno
              const top = d.points.reduce((a, b) => (b.y < a.y ? b : a), d.points[0]);
              return { type: "freehand" as const, points: d.points, x: top.x, y: top.y, color, label, origin: "ia" as const };
            }
            return { type: "rect" as const, x: d.x, y: d.y, w: d.w, h: d.h, color, label, origin: "ia" as const };
          }),
        ]);
        const withContour = detections.filter((d) => d.points && d.points.length >= 3).length;
        setDetectMsg(
          `${detections.length} achado(s) — ${withContour} com contorno. Confirme um a um (✓) ou apague (✕)${
            learning && learning.totalDecisions > 0 ? ` · IA calibrada por ${learning.totalDecisions} escolha(s) sua(s)` : ""
          }.`,
        );
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Falha na detecção.");
    } finally {
      setDetecting(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const all = draft ? [...annotations, draft] : annotations;
  const cursor = pendingStamp ? "copy" : "crosshair";
  // Escala da régua: a linha de calibração (mm conhecido) define px/mm; as
  // demais medições mostram mm. Sem calibração, mostra px e pede calibrar.
  const natW = imgRef.current?.naturalWidth ?? 0;
  const natH = imgRef.current?.naturalHeight ?? 0;
  const segPx = (a: FileAnnotation) => Math.hypot(((a.x2 ?? a.x) - a.x) * natW, ((a.y2 ?? a.y) - a.y) * natH);
  const calAnn = annotations.find((a) => a.type === "measure" && a.calibration && a.mm);
  const pxPerMm = calAnn && calAnn.mm ? segPx(calAnn) / calAnn.mm : null;
  const measureLabel = (a: FileAnnotation) => {
    const px = segPx(a);
    if (a.calibration && a.mm) return `${a.mm} mm (escala)`;
    return pxPerMm ? `${(px / pxPerMm).toFixed(1)} mm` : `${px.toFixed(0)} px — calibrar`;
  };
  const isHidden = (a: FileAnnotation) => !!a.label && hiddenLabels.has(baseLabel(a.label));
  // Resumo por classe dos achados da IA (contagem) — também serve de legenda/filtro.
  const aiSummary = (() => {
    const m = new Map<string, { count: number; color: string }>();
    for (const a of annotations) {
      if (a.origin !== "ia" || !a.label) continue;
      const bl = baseLabel(a.label);
      const e = m.get(bl) ?? { count: 0, color: a.color };
      e.count++;
      m.set(bl, e);
    }
    return [...m.entries()].sort((x, y) => y[1].count - x[1].count);
  })();
  function toggleLabel(bl: string) {
    setHiddenLabels((prev) => {
      const next = new Set(prev);
      if (next.has(bl)) next.delete(bl);
      else next.add(bl);
      return next;
    });
  }
  function toggleCariesFocus() {
    setCariesFocus((f) => {
      const next = !f;
      if (next) {
        const hide = new Set<string>();
        for (const a of annotations) {
          if (a.origin === "ia" && a.label) {
            const bl = baseLabel(a.label);
            if (!/c[áa]rie/i.test(bl)) hide.add(bl);
          }
        }
        setHiddenLabels(hide);
      } else {
        setHiddenLabels(new Set());
      }
      return next;
    });
  }
  function changeType(v: string) {
    setRtype(v);
    updatePatientFile(file.id, { radiographType: v }).catch(() => {});
  }

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: bright ? "#f4f4f5" : "#0a0a0a", display: "flex", flexDirection: "column" }}>
      {/* Cabeçalho enxuto — vidro, só o essencial */}
      <header
        style={{
          ...glassSurface(theme, { radius: 0 }),
          display: "flex",
          alignItems: "center",
          gap: theme.spacing.md,
          padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
          flexShrink: 0,
        }}
      >
        <button onClick={onClose} title="Fechar" style={ghost(theme)}>✕</button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: theme.typography.sizes.md, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {file.label ?? "Radiografia"}
          </div>
          <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
            {(RTYPES.find((t) => t.value === rtype)?.label ?? "Tipo não definido")} · {annotations.length} marcaç{annotations.length === 1 ? "ão" : "ões"}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Zoom em um único grupo compacto */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: 2, borderRadius: 999, background: theme.glass.surfaceStrong, border: `1px solid ${theme.glass.borderSoft}` }}>
          <button onClick={() => zoomBy(0.83)} title="Diminuir" style={pill(theme)}>−</button>
          <span style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, minWidth: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => zoomBy(1.2)} title="Aumentar" style={pill(theme)}>+</button>
          <button onClick={() => setPanMode((v) => !v)} title="Mover a imagem" style={pill(theme, panMode)}>✋</button>
          {zoom !== 1 && <button onClick={resetView} title="Resetar zoom" style={pill(theme)}>⟳</button>}
        </div>

        <button onClick={() => setBright((b) => !b)} title={bright ? "Fundo escuro" : "Negatoscópio (fundo claro)"} style={ghost(theme)}>
          {bright ? "🌙" : "☀"}
        </button>
        <button onClick={() => setShowOdonto(true)} title="Salvar achados no odontograma" style={ghost(theme)}>🦷 Odontograma</button>
        <button onClick={handleSave} disabled={saving} style={{ ...ghost(theme), background: theme.colors.primary, borderColor: theme.colors.primary, color: "#fff" }}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </header>

      {/* Área de trabalho: paleta · imagem · análise */}
      <div style={{ flex: 1, display: "flex", gap: theme.spacing.md, padding: theme.spacing.md, minHeight: 0 }}>
        {/* Paleta de ferramentas (estilo DIO) — ícones agrupados em vidro */}
        <aside
          style={{
            ...glassSurface(theme, { radius: theme.radius.lg }),
            width: 196,
            flexShrink: 0,
            padding: theme.spacing.md,
            display: "flex",
            flexDirection: "column",
            gap: theme.spacing.lg,
            overflowY: "auto",
          }}
        >
          <PaletteSection theme={theme} title="Desenho">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {DRAW_TOOLS.map((t) => (
                <Tile
                  key={t.id}
                  theme={theme}
                  active={tool === t.id && !pendingStamp}
                  accent={color}
                  title={t.label}
                  onClick={() => {
                    setTool(t.id);
                    setPendingStamp(null);
                    if (t.id !== "freehand") setAnatomyLabel(null);
                    if (t.id !== "measure") setCalibrating(false);
                  }}
                >
                  <span style={{ fontSize: 16 }}>{t.glyph}</span>
                </Tile>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`cor ${c}`}
                  style={{ width: 20, height: 20, borderRadius: "50%", background: c, cursor: "pointer", border: color === c ? `2px solid ${theme.colors.textPrimary}` : `1px solid ${theme.glass.borderSoft}` }}
                />
              ))}
            </div>
            {tool === "measure" && (
              <>
                <button onClick={() => setCalibrating((c) => !c)} style={{ ...ghost(theme), marginTop: 8, width: "100%", borderColor: calibrating ? "#FFD60A" : theme.glass.borderSoft, color: calibrating ? "#B58900" : theme.colors.textPrimary }}>
                  ⚖ {pxPerMm ? "Recalibrar" : "Calibrar mm"}
                </button>
                <div style={{ fontSize: 10, color: theme.colors.textSecondary, marginTop: 4, lineHeight: 1.4 }}>
                  {calibrating ? "Trace sobre uma medida conhecida e informe os mm." : pxPerMm ? "Escala pronta — medidas em mm." : "Sem escala: medidas em px."}
                </div>
              </>
            )}
          </PaletteSection>

          <PaletteSection theme={theme} title="Planejamento">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {STAMPS.map((s) => (
                <Tile
                  key={s.kind}
                  theme={theme}
                  active={pendingStamp === s.kind}
                  accent={s.color}
                  title={`${s.label} — clique e depois no dente`}
                  onClick={() => setPendingStamp(pendingStamp === s.kind ? null : s.kind)}
                >
                  <StampIcon kind={s.kind} size={20} color={s.color} />
                </Tile>
              ))}
            </div>
            {pendingStamp && (
              <div style={{ fontSize: 10, color: STAMPS.find((s) => s.kind === pendingStamp)!.color, marginTop: 6, fontWeight: 600 }}>
                Clique sobre o dente para posicionar.
              </div>
            )}
          </PaletteSection>

          <PaletteSection theme={theme} title="Contornos">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {ANATOMY.map((an) => {
                const active = tool === "freehand" && !pendingStamp && anatomyLabel === an.label;
                return (
                  <button
                    key={an.label}
                    onClick={() => {
                      setTool("freehand");
                      setPendingStamp(null);
                      setAnatomyLabel(an.label);
                      setAnatomyLine(!!an.line);
                      setColor(an.color);
                    }}
                    title={an.line ? "Trace a linha" : "Desenhe ao redor da estrutura"}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 8px",
                      borderRadius: 999,
                      fontSize: 11,
                      cursor: "pointer",
                      color: theme.colors.textPrimary,
                      border: `1px solid ${active ? an.color : theme.glass.borderSoft}`,
                      background: active ? `${an.color}22` : "transparent",
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: an.color, display: "inline-block" }} />
                    {an.label}
                  </button>
                );
              })}
              <button
                onClick={() => {
                  const custom = prompt("Nome da estrutura para contornar:");
                  if (!custom) return;
                  setTool("freehand");
                  setPendingStamp(null);
                  setAnatomyLabel(custom);
                  setAnatomyLine(false);
                }}
                style={{ padding: "3px 8px", borderRadius: 999, fontSize: 11, cursor: "pointer", color: theme.colors.textSecondary, border: `1px dashed ${theme.glass.borderSoft}`, background: "transparent" }}
              >
                ＋
              </button>
            </div>
          </PaletteSection>

          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setAnnotations((prev) => prev.slice(0, -1))} style={{ ...ghost(theme), flex: 1, fontSize: 11 }}>↶ Desfazer</button>
            <button onClick={() => setAnnotations([])} style={{ ...ghost(theme), flex: 1, fontSize: 11 }}>Limpar</button>
          </div>
        </aside>

        {/* Imagem */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <div
          ref={surfaceRef}
          onMouseDown={handleDown}
          onMouseMove={handleMove}
          onMouseUp={handleUp}
          onMouseLeave={handleUp}
          onWheel={handleWheel}
          style={{ position: "relative", maxWidth: "100%", maxHeight: "100%", overflow: "hidden", cursor: panMode ? "grab" : cursor, userSelect: "none" }}
        >
          {/* Wrapper de zoom/pan — escala/translada tudo junto, então os achados
              se separam ao ampliar (os rótulos são contra-escalados para não inchar) */}
          <div style={{ position: "relative", lineHeight: 0, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center center" }}>
          <img
            ref={imgRef}
            src={`${API_URL}${file.file_path}`}
            alt={file.label ?? ""}
            draggable={false}
            style={{ display: "block", maxWidth: "100%", maxHeight: "calc(100vh - 132px)", objectFit: "contain" }}
          />
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} viewBox="0 0 100 100" preserveAspectRatio="none">
            {all.map((a, i) => (a.type === "stamp" || isHidden(a) ? null : <AnnotationShape key={i} a={a} />))}
          </svg>

          {/* Rótulos das marcações (caixa/seta/círculo/texto/contorno) —
              cada um com ✕ para apagar só aquele achado (editar = revisar). */}
          {all.map((a, i) => {
            if (a.type === "stamp" || !a.label || isHidden(a)) return null;
            const isText = a.type === "text";
            const committed = i < annotations.length; // o rascunho é o último, sem controles
            const isAi = a.origin === "ia";
            const ctrl: React.CSSProperties = {
              pointerEvents: "auto",
              width: 16,
              height: 16,
              lineHeight: "14px",
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.7)",
              color: "#fff",
              fontSize: 11,
              cursor: "pointer",
              padding: 0,
            };
            return (
              <div
                key={`lbl-${i}`}
                style={{
                  position: "absolute",
                  left: `${a.x * 100}%`,
                  top: `${a.y * 100}%`,
                  // contra-escala: o rótulo não incha com o zoom, mas sua âncora
                  // se afasta dos vizinhos -> deixam de se sobrepor ao ampliar.
                  transform: `${isText ? "translate(-50%, -50%)" : "translateY(-100%)"} scale(${1 / zoom})`,
                  transformOrigin: isText ? "center center" : "left bottom",
                  background: a.color,
                  color: "#fff",
                  padding: "2px 6px 2px 8px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                  boxShadow: a.confirmed ? "0 0 0 2px #fff, 0 1px 4px rgba(0,0,0,0.5)" : "0 1px 4px rgba(0,0,0,0.4)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {a.confirmed ? "✓ " : isAi ? "✦ " : ""}
                {a.label}
                {committed && isAi && !a.confirmed && (
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      confirmFinding(i);
                    }}
                    title="Confirmar este achado (ensina a IA)"
                    style={{ ...ctrl, background: "#0FB5A8" }}
                  >
                    ✓
                  </button>
                )}
                {committed && (
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      rejectFinding(i);
                    }}
                    title={isAi ? "Rejeitar (ensina a IA) e remover" : "Remover esta marcação"}
                    style={{ ...ctrl, background: "rgba(0,0,0,0.3)" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}

          {/* Rótulos de medida (régua) — comprimento em mm/px no meio da linha */}
          {all.map((a, i) =>
            a.type === "measure" ? (
              <div
                key={`m-${i}`}
                style={{
                  position: "absolute",
                  left: `${((a.x + (a.x2 ?? a.x)) / 2) * 100}%`,
                  top: `${((a.y + (a.y2 ?? a.y)) / 2) * 100}%`,
                  transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                  background: a.color,
                  color: "#111",
                  padding: "1px 7px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                }}
              >
                {measureLabel(a)}
              </div>
            ) : null,
          )}

          {/* Carimbos de planejamento — arrastáveis, com controles ao passar o mouse */}
          {annotations.map((a, i) =>
            a.type === "stamp" && a.stamp ? (
              <StampOverlay
                key={`stamp-${i}`}
                a={a}
                onDragStart={(e) => {
                  e.stopPropagation();
                  setDragIdx(i);
                }}
                onRemove={() => removeAt(i)}
                onBigger={() => resizeStamp(i, 1.25)}
                onSmaller={() => resizeStamp(i, 0.8)}
              />
            ) : null,
          )}
          </div>
        </div>
      </div>


        {/* Painel de análise da IA — um só lugar, sem barras espalhadas */}
        <aside
          style={{
            ...glassSurface(theme, { radius: theme.radius.lg }),
            width: 296,
            flexShrink: 0,
            padding: theme.spacing.md,
            display: "flex",
            flexDirection: "column",
            gap: theme.spacing.sm,
            overflowY: "auto",
          }}
        >
          <div style={{ fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
            ✦ Análise por IA
          </div>

          {file.format === "image" && (
            <>
              <select value={rtype ?? ""} onChange={(e) => changeType(e.target.value)} style={field(theme)}>
                <option value="" disabled>Tipo da imagem…</option>
                {RTYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <select value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} style={field(theme)}>
                <option value={0.12}>Sensibilidade máxima</option>
                <option value={0.25}>Sensibilidade padrão</option>
                <option value={0.45}>Só alta confiança</option>
              </select>
              <button
                onClick={handleDetect}
                disabled={detecting}
                style={{ ...ghost(theme), width: "100%", background: theme.colors.primary, borderColor: theme.colors.primary, color: "#fff" }}
              >
                {detecting ? "Detectando…" : "⌖ Detectar achados"}
              </button>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={toggleCariesFocus} style={{ ...ghost(theme), flex: 1, fontSize: 11, borderColor: cariesFocus ? "#FF3B30" : theme.glass.borderSoft, color: cariesFocus ? "#FF3B30" : theme.colors.textPrimary }}>
                  🦷 Só cárie
                </button>
                <button onClick={handleAi} disabled={aiLoading} style={{ ...ghost(theme), flex: 1, fontSize: 11 }}>
                  {aiLoading ? "…" : "✦ Descrever"}
                </button>
              </div>
            </>
          )}

          {aiSummary.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              {aiSummary.map(([label, info]) => {
                const off = hiddenLabels.has(label);
                return (
                  <button
                    key={label}
                    onClick={() => toggleLabel(label)}
                    title={off ? "Mostrar" : "Ocultar"}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 9px",
                      borderRadius: 999,
                      fontSize: 11,
                      cursor: "pointer",
                      border: `1px solid ${info.color}`,
                      background: off ? "transparent" : `${info.color}22`,
                      color: theme.colors.textPrimary,
                      opacity: off ? 0.45 : 1,
                      textDecoration: off ? "line-through" : "none",
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: info.color, display: "inline-block" }} />
                    {label} <strong>{info.count}</strong>
                  </button>
                );
              })}
            </div>
          )}

          {detectMsg && (
            <div style={{ fontSize: 11, color: theme.colors.textSecondary, lineHeight: 1.45, marginTop: 4 }}>{detectMsg}</div>
          )}

          {learning && learning.totalDecisions > 0 && (
            <div style={{ borderRadius: theme.radius.sm, border: `1px solid ${theme.colors.primary}55`, background: `${theme.colors.primary}12`, padding: theme.spacing.sm, fontSize: 11, color: theme.colors.textPrimary }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Aprendendo com você ({learning.totalDecisions})</div>
              {Object.entries(learning.perLabel)
                .filter(([, s]) => s.rate != null)
                .sort((a, b) => (b[1].rate ?? 0) - (a[1].rate ?? 0))
                .slice(0, 6)
                .map(([label, s]) => (
                  <div key={label} style={{ color: theme.colors.textSecondary }}>
                    {label}: <strong style={{ color: theme.colors.textPrimary }}>{Math.round((s.rate ?? 0) * 100)}%</strong> confirma
                  </div>
                ))}
            </div>
          )}

          {aiError && <div style={{ fontSize: 11, color: theme.colors.danger }}>{aiError}</div>}
          {aiText && (
            <div style={{ fontSize: 12, color: theme.colors.textPrimary, whiteSpace: "pre-wrap", lineHeight: 1.5, borderTop: `1px solid ${theme.glass.borderSoft}`, paddingTop: theme.spacing.sm }}>
              {aiText}
            </div>
          )}

          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 10, color: theme.colors.textSecondary, lineHeight: 1.45, borderTop: `1px solid ${theme.glass.borderSoft}`, paddingTop: theme.spacing.sm }}>
            Sugestão experimental de IA — não é diagnóstico. Confirme (✓) ou apague (✕) cada achado.
          </div>
        </aside>
      </div>

      {showOdonto && (
        <OdontoSaveModal
          patientId={file.patient_id}
          findings={annotations.filter((a) => !!a.label && (a.type === "rect" || a.type === "circle" || (a.type === "freehand" && a.origin === "ia")))}
          bright={bright}
          primary={theme.colors.primary}
          onClose={() => setShowOdonto(false)}
          onDone={() => {
            setShowOdonto(false);
            onSaved();
          }}
        />
      )}
    </div>,
    document.body,
  );
}

// Revisão dos achados antes de gravar no odontograma: o profissional escolhe
// quais confia, em qual dente (FDI) e com qual status — nada vai pro prontuário
// sem essa confirmação. O backend ainda registra a ação no histórico do paciente.
function OdontoSaveModal({
  patientId,
  findings,
  bright,
  primary,
  onClose,
  onDone,
}: {
  patientId: string;
  findings: FileAnnotation[];
  bright: boolean;
  primary: string;
  onClose: () => void;
  onDone: () => void;
}) {
  type Row = { include: boolean; tooth: string; status: string; procedure: string; label: string; color: string };
  // Se há achados confirmados (✓), só eles vêm marcados por padrão; senão, todos.
  const noneConfirmed = findings.every((f) => !f.confirmed);
  const [rows, setRows] = useState<Row[]>(() =>
    findings.map((f) => {
      const m = mapFindingToOdonto(f.label ?? "");
      return { include: noneConfirmed ? true : !!f.confirmed, tooth: "", status: m.status, procedure: m.procedure, label: f.label ?? "", color: f.color };
    }),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(i: number, p: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }

  const ready = rows.filter((r) => r.include && /^\d{1,2}$/.test(r.tooth.trim()));

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      for (const r of ready) {
        await createOdontogramEntry(patientId, {
          toothNumber: Number(r.tooth.trim()),
          procedureName: `${r.procedure} — sugerido por radiografia`,
          status: r.status,
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar no odontograma.");
    } finally {
      setSaving(false);
    }
  }

  const card = bright ? "#fff" : "#1c1c1e";
  const txt = bright ? "#111" : "#eee";
  const sub = bright ? "#666" : "#aaa";
  const inputStyle: React.CSSProperties = {
    padding: "5px 8px",
    borderRadius: 6,
    border: `1px solid ${bright ? "#ccc" : "#555"}`,
    background: bright ? "#fff" : "#2c2c2e",
    color: txt,
    fontSize: 13,
  };

  return (
    <div
      onMouseDown={onClose}
      style={{ position: "absolute", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{ background: card, color: txt, borderRadius: 16, padding: 20, width: "min(720px, 96vw)", maxHeight: "86vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>🦷 Salvar achados no odontograma</div>
        <div style={{ fontSize: 12, color: sub, marginBottom: 14 }}>
          Marque só os achados que você confirma, informe o dente (FDI) e o status. Cada item vira um lançamento no odontograma e uma etapa no plano de tratamento, com registro no histórico.
        </div>

        {rows.length === 0 ? (
          <div style={{ fontSize: 14, color: sub, padding: "16px 0" }}>Nenhum achado para salvar. Rode a detecção (IA) ou marque caixas/círculos com rótulo na radiografia primeiro.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: `1px solid ${bright ? "#eee" : "#333"}`,
                  opacity: r.include ? 1 : 0.5,
                }}
              >
                <input type="checkbox" checked={r.include} onChange={(e) => patch(i, { include: e.target.checked })} style={{ width: 18, height: 18 }} />
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                <label style={{ fontSize: 11, color: sub }}>Dente</label>
                <input
                  value={r.tooth}
                  onChange={(e) => patch(i, { tooth: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                  placeholder="ex. 36"
                  inputMode="numeric"
                  style={{ ...inputStyle, width: 56 }}
                />
                <select value={r.status} onChange={(e) => patch(i, { status: e.target.value })} style={{ ...inputStyle, width: 130 }}>
                  {ODONTO_STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {error && <div style={{ color: "#FF3B30", fontSize: 13, marginTop: 10 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, gap: 10 }}>
          <span style={{ fontSize: 12, color: sub }}>{ready.length} de {rows.filter((r) => r.include).length} marcado(s) com dente válido</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btn(bright)}>Cancelar</button>
            <button
              onClick={confirm}
              disabled={saving || ready.length === 0}
              style={{ ...btn(bright), background: primary, color: "#fff", borderColor: primary, opacity: saving || ready.length === 0 ? 0.5 : 1 }}
            >
              {saving ? "Salvando..." : `Confirmar e salvar (${ready.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnnotationShape({ a }: { a: FileAnnotation }) {
  const x = a.x * 100;
  const y = a.y * 100;
  const sw = a.confirmed ? STROKE + 1.2 : STROKE;
  if (a.type === "measure") {
    const x2 = (a.x2 ?? a.x) * 100;
    const y2 = (a.y2 ?? a.y) * 100;
    return (
      <g stroke={a.color} strokeWidth={sw} strokeLinecap="round" fill={a.color} vectorEffect="non-scaling-stroke">
        <line x1={x} y1={y} x2={x2} y2={y2} />
        <circle cx={x} cy={y} r={0.7} />
        <circle cx={x2} cy={y2} r={0.7} />
      </g>
    );
  }
  if (a.type === "freehand") {
    if ((a.points?.length ?? 0) < 2) return null;
    const pts = (a.points ?? []).map((p) => `${p.x * 100},${p.y * 100}`).join(" ");
    if (a.openLine) {
      // Linha aberta (ex.: nível ósseo / crista alveolar) — não fecha em polígono.
      return <polyline points={pts} fill="none" stroke={a.color} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
    }
    return <polygon points={pts} fill={`${a.color}${a.confirmed ? "33" : "22"}`} stroke={a.color} strokeWidth={sw} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  }
  if (a.type === "rect") {
    const w = (a.w ?? 0) * 100;
    const h = (a.h ?? 0) * 100;
    return <rect x={Math.min(x, x + w)} y={Math.min(y, y + h)} width={Math.abs(w)} height={Math.abs(h)} rx={0.8} fill="none" stroke={a.color} strokeWidth={sw} vectorEffect="non-scaling-stroke" />;
  }
  if (a.type === "circle") {
    const w = (a.w ?? 0) * 100;
    const h = (a.h ?? 0) * 100;
    return <ellipse cx={x + w / 2} cy={y + h / 2} rx={Math.abs(w / 2)} ry={Math.abs(h / 2)} fill="none" stroke={a.color} strokeWidth={sw} vectorEffect="non-scaling-stroke" />;
  }
  if (a.type === "arrow") {
    const x2 = (a.x2 ?? a.x) * 100;
    const y2 = (a.y2 ?? a.y) * 100;
    const angle = Math.atan2(y2 - y, x2 - x);
    const head = 3.2;
    return (
      <g stroke={a.color} strokeWidth={STROKE} strokeLinecap="round" fill={a.color} vectorEffect="non-scaling-stroke">
        <line x1={x} y1={y} x2={x2} y2={y2} />
        <line x1={x2} y1={y2} x2={x2 - head * Math.cos(angle - Math.PI / 6)} y2={y2 - head * Math.sin(angle - Math.PI / 6)} />
        <line x1={x2} y1={y2} x2={x2 - head * Math.cos(angle + Math.PI / 6)} y2={y2 - head * Math.sin(angle + Math.PI / 6)} />
      </g>
    );
  }
  return null;
}

// Carimbo de tratamento posicionável/arrastável (mostra ao paciente o plano).
function StampOverlay({
  a,
  onDragStart,
  onRemove,
  onBigger,
  onSmaller,
}: {
  a: FileAnnotation;
  onDragStart: (e: React.MouseEvent) => void;
  onRemove: () => void;
  onBigger: () => void;
  onSmaller: () => void;
}) {
  const [hover, setHover] = useState(false);
  const size = 56 * (a.scale ?? 1);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={onDragStart}
      style={{
        position: "absolute",
        left: `${a.x * 100}%`,
        top: `${a.y * 100}%`,
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        cursor: "grab",
      }}
    >
      <StampIcon kind={a.stamp as StampKind} size={size} color={a.color} />
      <div style={{ background: a.color, color: "#fff", fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 6, marginTop: 2, boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
        {a.label}
      </div>
      {hover && (
        <div style={{ position: "absolute", top: -12, right: -12, display: "flex", gap: 3 }}>
          <CtrlBtn onClick={(e) => { e.stopPropagation(); onSmaller(); }}>−</CtrlBtn>
          <CtrlBtn onClick={(e) => { e.stopPropagation(); onBigger(); }}>+</CtrlBtn>
          <CtrlBtn onClick={(e) => { e.stopPropagation(); onRemove(); }} danger>✕</CtrlBtn>
        </div>
      )}
    </div>
  );
}

function CtrlBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: (e: React.MouseEvent) => void; danger?: boolean }) {
  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      style={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        border: "none",
        background: danger ? "#FF3B30" : "#333",
        color: "#fff",
        fontSize: 12,
        lineHeight: "20px",
        cursor: "pointer",
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

// Ícones de tratamento desenhados em SVG (sem depender de assets externos).
function StampIcon({ kind, size, color }: { kind: StampKind; size: number; color: string }) {
  const common = { width: size, height: size, viewBox: "0 0 48 48", style: { display: "block", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" } } as const;
  if (kind === "implante") {
    return (
      <svg {...common}>
        {/* coroa sobre o implante */}
        <path d="M14 16 q10 -10 20 0 q-4 4 -10 4 q-6 0 -10 -4 z" fill={color} />
        {/* parafuso/rosca */}
        <g fill={color}>
          <rect x="20" y="20" width="8" height="3" rx="1" />
          <path d="M19 24 h10 l-1 3 h-8 z" />
          <path d="M20 28 h8 l-1 3 h-6 z" />
          <path d="M21 32 h6 l-1 3 h-4 z" />
          <path d="M22.5 36 h3 l-1.5 5 l-1.5 -5 z" />
        </g>
      </svg>
    );
  }
  if (kind === "coroa") {
    return (
      <svg {...common}>
        <path d="M10 30 L10 18 L18 24 L24 14 L30 24 L38 18 L38 30 Q24 36 10 30 Z" fill={color} stroke="#fff" strokeWidth="1.5" />
      </svg>
    );
  }
  if (kind === "protese") {
    return (
      <svg {...common} fill={color} stroke="#fff" strokeWidth="1.2">
        <path d="M8 18 q4 -6 8 0 q0 8 -4 12 q-4 -4 -4 -12 z" />
        <path d="M20 18 q4 -6 8 0 q0 8 -4 12 q-4 -4 -4 -12 z" />
        <path d="M32 18 q4 -6 8 0 q0 8 -4 12 q-4 -4 -4 -12 z" />
        <rect x="12" y="22" width="24" height="3" stroke="none" />
      </svg>
    );
  }
  if (kind === "extracao") {
    return (
      <svg {...common}>
        <path d="M16 12 q8 -6 16 0 q3 6 -1 16 q-2 8 -4 8 q-2 0 -3 -6 q-1 6 -3 6 q-2 0 -4 -8 q-4 -10 -1 -16 z" fill="#fff" stroke={color} strokeWidth="2" />
        <g stroke={color} strokeWidth="4" strokeLinecap="round">
          <line x1="14" y1="14" x2="34" y2="34" />
          <line x1="34" y1="14" x2="14" y2="34" />
        </g>
      </svg>
    );
  }
  // aparelho / bracket
  return (
    <svg {...common} fill={color} stroke="#fff" strokeWidth="1.2">
      <line x1="6" y1="24" x2="42" y2="24" stroke={color} strokeWidth="3" />
      <rect x="11" y="19" width="9" height="10" rx="2" />
      <rect x="28" y="19" width="9" height="10" rx="2" />
    </svg>
  );
}

type Theme = ReturnType<typeof useTheme>["theme"];

// --- Chrome do negatoscópio no padrão Liquid Glass (tokens do design system) ---

function ghost(theme: Theme): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: `${theme.spacing.xs + 2}px ${theme.spacing.sm + 2}px`,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.glass.borderSoft}`,
    background: theme.glass.surfaceStrong,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.sizes.sm,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

function pill(theme: Theme, active = false): React.CSSProperties {
  return {
    width: 26,
    height: 26,
    borderRadius: 999,
    border: "none",
    background: active ? theme.colors.primary : "transparent",
    color: active ? "#fff" : theme.colors.textPrimary,
    fontSize: 13,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };
}

function field(theme: Theme): React.CSSProperties {
  return {
    width: "100%",
    padding: `${theme.spacing.xs + 2}px ${theme.spacing.sm}px`,
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.glass.borderSoft}`,
    background: theme.glass.surfaceStrong,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.sizes.sm,
    cursor: "pointer",
  };
}

function PaletteSection({ theme, title, children }: { theme: Theme; title: string; children: ReactNode }) {
  return (
    <section>
      <div
        style={{
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: theme.colors.textSecondary,
          fontWeight: theme.typography.weights.semibold,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function Tile({
  theme,
  active,
  accent,
  title,
  onClick,
  children,
}: {
  theme: Theme;
  active: boolean;
  accent: string;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        aspectRatio: "1 / 1",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: theme.radius.sm,
        border: `1px solid ${active ? accent : theme.glass.borderSoft}`,
        background: active ? `${accent}26` : theme.glass.surfaceStrong,
        color: theme.colors.textPrimary,
        cursor: "pointer",
        padding: 0,
        transition: `background ${theme.motion.fast}ms, border-color ${theme.motion.fast}ms`,
      }}
    >
      {children}
    </button>
  );
}

function btn(bright: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 8,
    border: `1px solid ${bright ? "#999" : "#555"}`,
    background: "transparent",
    color: bright ? "#111" : "#eee",
    cursor: "pointer",
    fontSize: 13,
  };
}
