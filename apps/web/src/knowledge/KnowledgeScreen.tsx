import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { KnowledgeNote } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { PrimaryButton } from "../FormField";
import {
  listKnowledge,
  getKnowledgeNote,
  createKnowledgeNote,
  updateKnowledgeNote,
  deleteKnowledgeNote,
  type KnowledgeListItem,
} from "../api";

export function KnowledgeScreen() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<KnowledgeListItem[]>([]);
  const [active, setActive] = useState<KnowledgeNote | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function refreshList() {
    const { notes } = await listKnowledge();
    setNotes(notes);
  }
  useEffect(() => {
    refreshList();
  }, []);

  async function open(id: string) {
    const { note } = await getKnowledgeNote(id);
    setActive(note);
    setTitle(note.title);
    setBody(note.body);
  }
  async function create(withTitle = "Nova nota") {
    const { note } = await createKnowledgeNote({ title: withTitle, body: "" });
    await refreshList();
    open(note.id);
  }
  async function openOrCreate(linkTitle: string) {
    const existing = notes.find((n) => n.title.toLowerCase() === linkTitle.toLowerCase());
    if (existing) open(existing.id);
    else create(linkTitle);
  }
  async function save() {
    if (!active) return;
    setSaving(true);
    try {
      await updateKnowledgeNote(active.id, { title: title.trim() || active.title, body });
      await refreshList();
      await open(active.id);
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!active || !confirm(`Apagar a nota "${active.title}"?`)) return;
    await deleteKnowledgeNote(active.id);
    setActive(null);
    refreshList();
  }

  const chip = (label: string, onClick: () => void, color: string) => (
    <button
      key={label}
      onClick={onClick}
      style={{ border: `1px solid ${color}`, background: `${color}18`, color: theme.colors.textPrimary, borderRadius: 999, padding: "3px 10px", fontSize: 12, cursor: "pointer", margin: "2px" }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", padding: theme.spacing.xl }}>
      <header style={{ ...glassSurface(theme, { radius: theme.radius.lg }), display: "flex", alignItems: "center", gap: theme.spacing.md, padding: `${theme.spacing.md}px ${theme.spacing.lg}px`, marginBottom: theme.spacing.xl }}>
        <button onClick={() => navigate("/")} aria-label="Voltar" style={{ border: "none", background: "transparent", color: theme.colors.textSecondary, fontSize: theme.typography.sizes.lg, cursor: "pointer" }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: theme.typography.sizes.xl, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary }}>Notas</div>
          <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>Sua rede de conhecimento — ligue ideias com [[colchetes duplos]].</div>
        </div>
        <PrimaryButton onClick={() => create()}>+ Nova nota</PrimaryButton>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 300px) 1fr", gap: theme.spacing.lg, alignItems: "start" }}>
        {/* Lista */}
        <div style={{ ...glassSurface(theme, { radius: theme.radius.md }), padding: theme.spacing.sm, maxHeight: "78vh", overflowY: "auto" }}>
          {notes.length === 0 && <div style={{ color: theme.colors.textSecondary, fontSize: 13, padding: theme.spacing.md }}>Nenhuma nota ainda.</div>}
          {notes.map((n) => (
            <button
              key={n.id}
              onClick={() => open(n.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: "none",
                background: active?.id === n.id ? theme.glass.surfaceStrong : "transparent",
                borderRadius: theme.radius.sm,
                padding: theme.spacing.sm,
                cursor: "pointer",
                marginBottom: 2,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: theme.colors.textPrimary }}>{n.title}</div>
              <div style={{ fontSize: 11, color: theme.colors.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {n.link_count > 0 ? `🔗 ${n.link_count} · ` : ""}{n.snippet || "—"}
              </div>
            </button>
          ))}
        </div>

        {/* Editor */}
        <div style={{ ...glassSurface(theme, { radius: theme.radius.md }), padding: theme.spacing.lg, minHeight: 320 }}>
          {!active ? (
            <div style={{ color: theme.colors.textSecondary, fontSize: 14 }}>Selecione uma nota à esquerda ou crie uma nova. Use [[Título]] para ligar a outra nota.</div>
          ) : (
            <>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título"
                style={{ width: "100%", fontSize: 18, fontWeight: 700, background: "transparent", border: "none", borderBottom: `1px solid ${theme.glass.borderSoft}`, color: theme.colors.textPrimary, padding: "4px 0", marginBottom: theme.spacing.md, outline: "none" }}
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Escreva… ligue ideias com [[outra nota]]"
                style={{ width: "100%", minHeight: 220, resize: "vertical", background: "transparent", border: `1px solid ${theme.glass.borderSoft}`, borderRadius: theme.radius.sm, color: theme.colors.textPrimary, padding: theme.spacing.sm, fontSize: 14, lineHeight: 1.5, outline: "none", fontFamily: "inherit" }}
              />
              <div style={{ display: "flex", gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
                <PrimaryButton onClick={save}>{saving ? "Salvando…" : "Salvar"}</PrimaryButton>
                <button onClick={remove} style={{ border: "none", background: "transparent", color: theme.colors.textSecondary, cursor: "pointer" }}>Apagar</button>
              </div>

              {(active.links?.length || active.missing_links?.length) ? (
                <div style={{ marginTop: theme.spacing.lg }}>
                  <div style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 }}>Liga para:</div>
                  {active.links?.map((l) => chip(l.title, () => open(l.id), theme.colors.primary))}
                  {active.missing_links?.map((t) => chip(`${t} +`, () => openOrCreate(t), theme.colors.textSecondary))}
                </div>
              ) : null}

              {active.backlinks && active.backlinks.length > 0 && (
                <div style={{ marginTop: theme.spacing.md }}>
                  <div style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 }}>Mencionada em:</div>
                  {active.backlinks.map((b) => chip(b.title, () => open(b.id), "#0FB5A8"))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
