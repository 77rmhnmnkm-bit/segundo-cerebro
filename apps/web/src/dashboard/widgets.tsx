import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { MiniCalendar } from "./MiniCalendar";
import { NextEventWidget } from "./NextEventWidget";
import { UsageChart } from "./UsageChart";
import { NotesWidget } from "./NotesWidget";
import { RecallsWidget } from "./RecallsWidget";
import { UpdatesWidget } from "./UpdatesWidget";

// Grade de posição livre (estilo widgets da Apple): 12 colunas, altura de linha
// fixa. Cada widget guarda x,y (posição) e w,h (tamanho) em unidades de grade,
// então o usuário pode soltar onde quiser; colisões são resolvidas empurrando
// os outros para baixo (o widget que você arrasta sempre fica onde você soltou).
export const COLS = 12;
export const ROW_PX = 86;
export const GRID_GAP = 16;

export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetDef {
  id: string;
  title: string;
  defW: number;
  defH: number;
  render: () => ReactNode;
}

export const WIDTH_STEPS = [3, 6, 12]; // P / M / G em colunas

type ColorKey = "categoryAtendimento" | "categoryPessoal" | "categoryAcademico" | "primary";
const MODULES: { id: string; name: string; subtitle: string; color: ColorKey; path: string }[] = [
  { id: "mod:pacientes", name: "Pacientes", subtitle: "Prontuário, arquivos, negatoscópio", color: "categoryAtendimento", path: "/pacientes" },
  { id: "mod:agenda", name: "Agenda", subtitle: "Compromissos com classificação por IA", color: "categoryPessoal", path: "/agenda" },
  { id: "mod:estoque", name: "Estoque", subtitle: "Materiais, instrumentais e validade", color: "categoryAcademico", path: "/estoque" },
  { id: "mod:biblioteca", name: "Biblioteca", subtitle: "Procedimentos, calculadoras e orientações", color: "primary", path: "/biblioteca" },
  { id: "mod:financeiro", name: "Financeiro", subtitle: "Pagamentos, recibos e pendências", color: "categoryAtendimento", path: "/financeiro" },
  { id: "mod:esterilizacao", name: "Esterilização", subtitle: "Ciclos e indicador biológico", color: "categoryAcademico", path: "/esterilizacao" },
  { id: "mod:habitos", name: "Hábitos", subtitle: "Rotinas baseadas em ciência", color: "categoryAcademico", path: "/habitos" },
  { id: "mod:notas", name: "Notas", subtitle: "Sua rede de conhecimento (PKM)", color: "primary", path: "/notas" },
];

function ModuleShortcut({ name, subtitle, color, path }: { name: string; subtitle: string; color: ColorKey; path: string }) {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const c = theme.colors[color];
  return (
    <div onClick={() => navigate(path)} style={{ ...glassSurface(theme), padding: theme.spacing.lg, cursor: "pointer", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ width: 12, height: 12, borderRadius: 999, background: c, marginBottom: theme.spacing.sm, boxShadow: `0 0 0 6px ${c}22` }} />
      <div style={{ fontSize: theme.typography.sizes.lg, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>{name}</div>
      <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm, marginTop: 4 }}>{subtitle}</div>
    </div>
  );
}

export const WIDGETS: WidgetDef[] = [
  ...MODULES.map((m) => ({ id: m.id, title: m.name, defW: 3, defH: 2, render: () => <ModuleShortcut name={m.name} subtitle={m.subtitle} color={m.color} path={m.path} /> })),
  { id: "calendar", title: "Calendário", defW: 4, defH: 4, render: () => <MiniCalendar /> },
  { id: "usage", title: "Uso de estoque", defW: 4, defH: 3, render: () => <UsageChart /> },
  { id: "notes", title: "Notas rápidas", defW: 4, defH: 3, render: () => <NotesWidget /> },
  { id: "recalls", title: "Retornos", defW: 4, defH: 3, render: () => <RecallsWidget /> },
  { id: "updates", title: "Novidades", defW: 4, defH: 4, render: () => <UpdatesWidget /> },
  { id: "nextEvent", title: "Próximo compromisso", defW: 12, defH: 2, render: () => <NextEventWidget /> },
];

export function widgetById(id: string): WidgetDef | undefined {
  return WIDGETS.find((w) => w.id === id);
}

export function collides(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Empacota uma ordem de widgets em prateleiras de 12 colunas (layout inicial).
export function computeFlow(order: { id: string; w: number; h: number }[]): Box[] {
  const boxes: Box[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const it of order) {
    if (x + it.w > COLS) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    boxes.push({ id: it.id, x, y, w: it.w, h: it.h });
    x += it.w;
    rowH = Math.max(rowH, it.h);
  }
  return boxes;
}

// Resolve sobreposições: o widget "âncora" (o que está sendo movido) fica fixo;
// os demais, na ordem y→x, são empurrados para baixo até não colidir.
export function resolveCollisions(boxes: Box[], anchorId: string): Box[] {
  const result = boxes.map((b) => ({ ...b }));
  const anchor = result.find((b) => b.id === anchorId);
  const placed: Box[] = anchor ? [anchor] : [];
  const others = result
    .filter((b) => b.id !== anchorId)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  for (const b of others) {
    let guard = 0;
    while (placed.some((p) => collides(b, p)) && guard++ < 500) b.y += 1;
    placed.push(b);
  }
  return result;
}

// Move um widget para (x,y) com limites e resolve colisões. Pura — testável.
export function moveBox(boxes: Box[], id: string, x: number, y: number): Box[] {
  const next = boxes.map((b) => (b.id === id ? { ...b, x: Math.max(0, Math.min(COLS - b.w, x)), y: Math.max(0, y) } : { ...b }));
  return resolveCollisions(next, id);
}

export function resizeBox(boxes: Box[], id: string, w: number): Box[] {
  const next = boxes.map((b) => (b.id === id ? { ...b, w, x: Math.max(0, Math.min(COLS - w, b.x)) } : { ...b }));
  return resolveCollisions(next, id);
}

export const DEFAULT_LAYOUT: Box[] = computeFlow(
  WIDGETS.filter((w) => w.id !== "nextEvent").map((w) => ({ id: w.id, w: w.defW, h: w.defH })).concat([{ id: "nextEvent", w: 12, h: 2 }]),
);

export function sanitizeLayout(saved: unknown): Box[] {
  if (!Array.isArray(saved)) return DEFAULT_LAYOUT;
  const seen = new Set<string>();
  const out: Box[] = [];
  for (const it of saved) {
    if (it && typeof it.id === "string" && widgetById(it.id) && !seen.has(it.id) && [it.x, it.y, it.w, it.h].every((n) => typeof n === "number")) {
      seen.add(it.id);
      out.push({ id: it.id, x: Math.max(0, Math.min(COLS - 1, it.x)), y: Math.max(0, it.y), w: Math.max(1, Math.min(COLS, it.w)), h: Math.max(1, it.h) });
    }
  }
  return out.length ? out : DEFAULT_LAYOUT;
}

// Próxima posição livre (para adicionar um widget): abaixo de tudo.
export function nextFreeSpot(boxes: Box[]): { x: number; y: number } {
  const maxY = boxes.reduce((m, b) => Math.max(m, b.y + b.h), 0);
  return { x: 0, y: maxY };
}
