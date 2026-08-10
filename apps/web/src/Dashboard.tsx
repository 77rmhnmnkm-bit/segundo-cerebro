import { useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "./ThemeProvider";
import { clearToken, logout, getSetting, putSetting } from "./api";
import { SettingsModal } from "./SettingsModal";
import {
  WIDGETS,
  DEFAULT_LAYOUT,
  WIDTH_STEPS,
  COLS,
  ROW_PX,
  GRID_GAP,
  moveBox,
  resizeBox,
  nextFreeSpot,
  sanitizeLayout,
  widgetById,
  type Box,
} from "./dashboard/widgets";

export function Dashboard({ user, onLoggedOut }: { user: User; onLoggedOut: () => void }) {
  const { theme, mode, toggleMode } = useTheme();
  const [showSettings, setShowSettings] = useState(false);
  const [layout, setLayout] = useState<Box[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number; base: Box[] } | null>(null);

  useEffect(() => {
    getSetting("dashboard_layout")
      .then(({ setting }) => setLayout(sanitizeLayout(setting.value)))
      .catch(() => setLayout(DEFAULT_LAYOUT));
  }, []);

  function persist(next: Box[]) {
    setLayout(next);
    putSetting("dashboard_layout", next).catch(() => {});
  }

  async function handleLogout() {
    await logout().catch(() => {});
    clearToken();
    onLoggedOut();
  }

  // ---- arrasto livre por ponteiro ----
  function onPointerDown(e: React.PointerEvent, id: string) {
    if (!editing || !layout) return;
    const box = layout.find((b) => b.id === id);
    if (!box) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ponteiro sintético/sem captura — segue sem capturar */
    }
    drag.current = { id, startX: e.clientX, startY: e.clientY, origX: box.x, origY: box.y, base: layout };
    setDragId(id);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const pitchX = (rect.width + GRID_GAP) / COLS;
    const pitchY = ROW_PX + GRID_GAP;
    const dCol = Math.round((e.clientX - d.startX) / pitchX);
    const dRow = Math.round((e.clientY - d.startY) / pitchY);
    setLayout(moveBox(d.base, d.id, d.origX + dCol, d.origY + dRow));
  }
  function onPointerUp() {
    if (drag.current && layout) persist(layout);
    drag.current = null;
    setDragId(null);
  }

  function cycleSize(id: string) {
    if (!layout) return;
    const b = layout.find((x) => x.id === id);
    if (!b) return;
    const i = WIDTH_STEPS.indexOf(b.w);
    const w = WIDTH_STEPS[(i + 1) % WIDTH_STEPS.length];
    persist(resizeBox(layout, id, w));
  }
  function removeWidget(id: string) {
    if (!layout) return;
    persist(layout.filter((b) => b.id !== id));
  }
  function addWidget(id: string) {
    if (!layout || layout.some((b) => b.id === id)) return;
    const def = widgetById(id);
    if (!def) return;
    const spot = nextFreeSpot(layout);
    persist([...layout, { id, x: spot.x, y: spot.y, w: def.defW, h: def.defH }]);
  }
  function resetLayout() {
    persist(DEFAULT_LAYOUT);
  }

  const available = WIDGETS.filter((w) => !layout?.some((b) => b.id === w.id));
  const maxRow = layout ? layout.reduce((m, b) => Math.max(m, b.y + b.h), 0) : 0;

  return (
    <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", padding: theme.spacing.xl }}>
      <header
        style={{
          ...glassSurface(theme, { radius: theme.radius.lg }),
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: `${theme.spacing.md}px ${theme.spacing.lg}px`,
          marginBottom: theme.spacing.xl,
          flexWrap: "wrap",
          gap: theme.spacing.sm,
        }}
      >
        <div>
          <div style={{ fontSize: theme.typography.sizes.xl, fontWeight: theme.typography.weights.bold, letterSpacing: theme.typography.tracking.tight, color: theme.colors.textPrimary }}>
            Olá, {user.name.split(" ")[0]}
          </div>
          <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>
            {editing ? "Arraste cada widget para onde quiser · P/M/G para o tamanho · ✕ para remover" : "Tudo pronto para hoje."}
          </div>
        </div>

        <div style={{ display: "flex", gap: theme.spacing.sm, flexWrap: "wrap" }}>
          {editing ? (
            <>
              <GhostButton theme={theme} onClick={() => setShowGallery((s) => !s)}>+ Adicionar widget</GhostButton>
              <GhostButton theme={theme} onClick={resetLayout}>↺ Restaurar padrão</GhostButton>
              <GhostButton theme={theme} onClick={() => { setEditing(false); setShowGallery(false); }} primary>✓ Concluir</GhostButton>
            </>
          ) : (
            <>
              <GhostButton theme={theme} onClick={() => setEditing(true)}>✎ Editar painel</GhostButton>
              <GhostButton theme={theme} onClick={() => setShowSettings(true)}>⚙ Configurações</GhostButton>
              <GhostButton theme={theme} onClick={toggleMode}>{mode === "light" ? "Modo escuro" : "Modo claro"}</GhostButton>
              <GhostButton theme={theme} onClick={handleLogout}>Sair</GhostButton>
            </>
          )}
        </div>
      </header>

      {editing && showGallery && (
        <div style={{ ...glassSurface(theme, { radius: theme.radius.md }), padding: theme.spacing.md, marginBottom: theme.spacing.lg }}>
          <div style={{ fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }}>
            Adicionar widget {available.length === 0 && "— todos já estão no painel"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: theme.spacing.sm }}>
            {available.map((w) => (
              <button key={w.id} onClick={() => addWidget(w.id)} style={{ border: `1px solid ${theme.glass.borderSoft}`, background: theme.mode === "light" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.08)", color: theme.colors.textPrimary, borderRadius: theme.radius.md, padding: `${theme.spacing.sm}px ${theme.spacing.md}px`, fontSize: theme.typography.sizes.sm, cursor: "pointer" }}>
                + {w.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {layout && (
        <div
          ref={gridRef}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
            gridAutoRows: `${ROW_PX}px`,
            gap: GRID_GAP,
            minHeight: maxRow * (ROW_PX + GRID_GAP),
            touchAction: editing ? "none" : "auto",
          }}
        >
          {layout.map((b) => {
            const def = widgetById(b.id);
            if (!def) return null;
            const isDragging = dragId === b.id;
            return (
              <div
                key={b.id}
                onPointerDown={(e) => onPointerDown(e, b.id)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                style={{
                  gridColumn: `${b.x + 1} / span ${b.w}`,
                  gridRow: `${b.y + 1} / span ${b.h}`,
                  position: "relative",
                  borderRadius: theme.radius.lg,
                  outline: editing ? `2px dashed ${theme.glass.borderSoft}` : "none",
                  outlineOffset: 3,
                  cursor: editing ? (isDragging ? "grabbing" : "grab") : "default",
                  transform: isDragging ? "scale(1.03)" : "none",
                  zIndex: isDragging ? 10 : 1,
                  boxShadow: isDragging ? `0 24px 50px -12px ${theme.glass.shadow}` : "none",
                  transition: isDragging ? "none" : "transform 140ms ease, grid-column 160ms ease, grid-row 160ms ease",
                  animation: editing && !isDragging ? "wig 0.7s ease-in-out infinite" : "none",
                }}
              >
                <div style={{ pointerEvents: editing ? "none" : "auto", height: "100%", overflow: "hidden", borderRadius: theme.radius.lg }}>{def.render()}</div>
                {editing && (
                  <div style={{ position: "absolute", top: -10, right: -8, display: "flex", gap: 4, zIndex: 3 }}>
                    <button onPointerDown={(e) => e.stopPropagation()} onClick={() => cycleSize(b.id)} title="Tamanho (P/M/G)" style={ctrlBtn(theme.colors.primary)}>
                      {b.w <= 3 ? "P" : b.w <= 6 ? "M" : "G"}
                    </button>
                    <button onPointerDown={(e) => e.stopPropagation()} onClick={() => removeWidget(b.id)} title="Remover" style={ctrlBtn("#FF3B30")}>✕</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <style>{`@keyframes wig{0%{transform:rotate(-0.35deg)}50%{transform:rotate(0.35deg)}100%{transform:rotate(-0.35deg)}}`}</style>
    </div>
  );
}

function ctrlBtn(bg: string): React.CSSProperties {
  return {
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: "1.5px solid #fff",
    background: bg,
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
    padding: 0,
  };
}

function GhostButton({ theme, onClick, children, primary }: { theme: ReturnType<typeof useTheme>["theme"]; onClick: () => void; children: ReactNode; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: primary ? theme.colors.primary : theme.mode === "light" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.08)",
        border: `1px solid ${primary ? theme.colors.primary : theme.glass.borderSoft}`,
        color: primary ? "#fff" : theme.colors.textPrimary,
        borderRadius: theme.radius.md,
        padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
        fontSize: theme.typography.sizes.sm,
        cursor: "pointer",
        transition: `transform ${theme.motion.fast}ms ${theme.motion.spring}, background ${theme.motion.fast}ms`,
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );
}
