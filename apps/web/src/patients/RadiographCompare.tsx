import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FileAnnotation, PatientFile } from "@app/core";
import { API_URL } from "../api";

// Comparação temporal ("máquina do tempo"): mesma região do paciente em duas
// datas, com slider wipe (antes/depois) ou lado a lado, sobrepondo as marcações
// salvas (contornos da IA, anotações) de cada data — para mostrar ao paciente a
// progressão de uma cárie ou a cicatrização óssea. Não há registro pixel-a-pixel
// das imagens; é apoio visual, então o ideal é comparar incidências parecidas.
export function RadiographCompare({ files, onClose }: { files: PatientFile[]; onClose: () => void }) {
  const images = useMemo(
    () => files.filter((f) => f.format === "image").sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    [files],
  );
  const [leftId, setLeftId] = useState(images[0]?.id ?? "");
  const [rightId, setRightId] = useState(images[images.length - 1]?.id ?? "");
  const [mode, setMode] = useState<"wipe" | "side">("wipe");
  const [showAnno, setShowAnno] = useState(true);
  const [wipe, setWipe] = useState(0.5);
  const wipeRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const left = images.find((f) => f.id === leftId);
  const right = images.find((f) => f.id === rightId);

  function dateLabel(f?: PatientFile) {
    return f ? new Date(f.created_at).toLocaleDateString("pt-BR") : "—";
  }
  function onWipeMove(clientX: number) {
    const r = wipeRef.current?.getBoundingClientRect();
    if (!r) return;
    setWipe(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
  }

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "#0a0a0a", display: "flex", flexDirection: "column" }}>
      {/* Barra */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", flexWrap: "wrap", background: "rgba(20,20,20,0.95)", borderBottom: "1px solid #333" }}>
        <strong style={{ color: "#fff", fontSize: 14 }}>🕐 Comparar no tempo</strong>
        <label style={{ color: "#bbb", fontSize: 12 }}>Antes:</label>
        <select value={leftId} onChange={(e) => setLeftId(e.target.value)} style={selStyle}>
          {images.map((f) => (
            <option key={f.id} value={f.id}>
              {new Date(f.created_at).toLocaleDateString("pt-BR")} — {f.label ?? "imagem"}
            </option>
          ))}
        </select>
        <label style={{ color: "#bbb", fontSize: 12 }}>Depois:</label>
        <select value={rightId} onChange={(e) => setRightId(e.target.value)} style={selStyle}>
          {images.map((f) => (
            <option key={f.id} value={f.id}>
              {new Date(f.created_at).toLocaleDateString("pt-BR")} — {f.label ?? "imagem"}
            </option>
          ))}
        </select>
        <button onClick={() => setMode(mode === "wipe" ? "side" : "wipe")} style={barBtn}>
          {mode === "wipe" ? "⇆ Lado a lado" : "▣ Slider (antes/depois)"}
        </button>
        <button onClick={() => setShowAnno((s) => !s)} style={{ ...barBtn, borderColor: showAnno ? "#0FB5A8" : "#555", color: showAnno ? "#0FB5A8" : "#eee" }}>
          ✦ Marcações
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={barBtn}>✕ Fechar</button>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 16 }}>
        {mode === "side" ? (
          <div style={{ display: "flex", gap: 12, width: "100%", height: "100%" }}>
            <Pane file={left} dateLabel={dateLabel(left)} showAnno={showAnno} caption="Antes" />
            <Pane file={right} dateLabel={dateLabel(right)} showAnno={showAnno} caption="Depois" />
          </div>
        ) : (
          // Slider wipe: "Depois" por cima, recortado pela divisória arrastável.
          <div
            ref={wipeRef}
            onMouseDown={(e) => {
              dragging.current = true;
              onWipeMove(e.clientX);
            }}
            onMouseMove={(e) => dragging.current && onWipeMove(e.clientX)}
            onMouseUp={() => (dragging.current = false)}
            onMouseLeave={() => (dragging.current = false)}
            style={{ position: "relative", maxWidth: "100%", maxHeight: "100%", cursor: "ew-resize", userSelect: "none" }}
          >
            {left && <ImageWithAnno file={left} showAnno={showAnno} />}
            {right && (
              <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 0 0 ${wipe * 100}%)` }}>
                <ImageWithAnno file={right} showAnno={showAnno} />
              </div>
            )}
            {/* divisória */}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${wipe * 100}%`, width: 2, background: "#fff", boxShadow: "0 0 6px rgba(0,0,0,0.8)", pointerEvents: "none" }}>
              <div style={{ position: "absolute", top: "50%", left: -13, width: 28, height: 28, marginTop: -14, borderRadius: "50%", background: "#fff", color: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>⇆</div>
            </div>
            <span style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 12, padding: "2px 8px", borderRadius: 6 }}>Antes · {dateLabel(left)}</span>
            <span style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 12, padding: "2px 8px", borderRadius: 6 }}>Depois · {dateLabel(right)}</span>
          </div>
        )}
      </div>
      <div style={{ padding: "6px 16px", background: "rgba(20,20,20,0.95)", borderTop: "1px solid #333", fontSize: 11, color: "#999" }}>
        Apoio visual de progressão — compare incidências parecidas. As imagens não são registradas pixel a pixel.
      </div>
    </div>,
    document.body,
  );
}

const selStyle: React.CSSProperties = { background: "#2c2c2e", color: "#eee", border: "1px solid #555", borderRadius: 6, padding: "5px 8px", fontSize: 12, maxWidth: 220 };
const barBtn: React.CSSProperties = { background: "transparent", color: "#eee", border: "1px solid #555", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" };

function Pane({ file, dateLabel, showAnno, caption }: { file?: PatientFile; dateLabel: string; showAnno: boolean; caption: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
      <span style={{ color: "#bbb", fontSize: 12 }}>{caption} · {dateLabel}</span>
      <div style={{ position: "relative", maxWidth: "100%", maxHeight: "82%", overflow: "hidden" }}>
        {file ? <ImageWithAnno file={file} showAnno={showAnno} maxHeight="78vh" /> : <span style={{ color: "#777" }}>—</span>}
      </div>
    </div>
  );
}

function ImageWithAnno({ file, showAnno, maxHeight = "82vh" }: { file: PatientFile; showAnno: boolean; maxHeight?: string }) {
  return (
    <div style={{ position: "relative", lineHeight: 0 }}>
      <img src={`${API_URL}${file.file_path}`} alt={file.label ?? ""} draggable={false} style={{ display: "block", maxWidth: "100%", maxHeight, objectFit: "contain" }} />
      {showAnno && file.annotations && file.annotations.length > 0 && (
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} viewBox="0 0 100 100" preserveAspectRatio="none">
          {file.annotations.map((a, i) => (
            <AnnoShape key={i} a={a} />
          ))}
        </svg>
      )}
    </div>
  );
}

// Render compacto das marcações (sem controles) para a comparação.
function AnnoShape({ a }: { a: FileAnnotation }) {
  const sw = 2.2;
  if (a.type === "freehand" && a.points && a.points.length > 1) {
    const pts = a.points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ");
    return a.openLine ? (
      <polyline points={pts} fill="none" stroke={a.color} strokeWidth={sw} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    ) : (
      <polygon points={pts} fill={`${a.color}22`} stroke={a.color} strokeWidth={sw} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    );
  }
  if (a.type === "rect") {
    const w = (a.w ?? 0) * 100;
    const h = (a.h ?? 0) * 100;
    return <rect x={Math.min(a.x * 100, a.x * 100 + w)} y={Math.min(a.y * 100, a.y * 100 + h)} width={Math.abs(w)} height={Math.abs(h)} fill="none" stroke={a.color} strokeWidth={sw} vectorEffect="non-scaling-stroke" />;
  }
  if (a.type === "circle") {
    const w = (a.w ?? 0) * 100;
    const h = (a.h ?? 0) * 100;
    return <ellipse cx={a.x * 100 + w / 2} cy={a.y * 100 + h / 2} rx={Math.abs(w / 2)} ry={Math.abs(h / 2)} fill="none" stroke={a.color} strokeWidth={sw} vectorEffect="non-scaling-stroke" />;
  }
  return null;
}
