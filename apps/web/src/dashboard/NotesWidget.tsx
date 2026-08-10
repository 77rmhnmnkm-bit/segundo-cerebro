import { useEffect, useState, type FormEvent } from "react";
import type { InboxNote } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { createNote, deleteNote, listNotes, setNoteDone } from "../api";
import { VoiceButton } from "../VoiceButton";

export function NotesWidget() {
  const { theme } = useTheme();
  const [notes, setNotes] = useState<InboxNote[]>([]);
  const [text, setText] = useState("");

  async function refresh() {
    const { notes } = await listNotes();
    setNotes(notes);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await createNote(text.trim());
    setText("");
    refresh();
  }

  async function toggle(note: InboxNote) {
    await setNoteDone(note.id, !note.done);
    refresh();
  }

  async function remove(id: string) {
    await deleteNote(id);
    refresh();
  }

  return (
    <div style={{ ...glassSurface(theme), padding: theme.spacing.lg, display: "flex", flexDirection: "column" }}>
      <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }}>
        Notas rápidas
      </div>

      <form onSubmit={handleAdd} style={{ display: "flex", gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Anotar algo rápido..."
          style={{
            flex: 1,
            background: theme.mode === "light" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.06)",
            border: `1px solid ${theme.glass.borderSoft}`,
            borderRadius: theme.radius.sm,
            padding: `${theme.spacing.xs + 2}px ${theme.spacing.sm}px`,
            fontSize: theme.typography.sizes.sm,
            color: theme.colors.textPrimary,
            outline: "none",
          }}
        />
        <VoiceButton compact onTranscribed={(t) => setText((prev) => (prev ? `${prev} ${t}` : t))} />
        <button
          type="submit"
          style={{
            background: theme.colors.primary,
            color: theme.colors.onPrimary,
            border: "none",
            borderRadius: theme.radius.sm,
            padding: `0 ${theme.spacing.sm + 4}px`,
            fontSize: theme.typography.sizes.sm,
            cursor: "pointer",
          }}
        >
          +
        </button>
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
        {notes.length === 0 && (
          <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>Nenhuma nota ainda.</div>
        )}
        {notes.map((note) => (
          <div key={note.id} style={{ display: "flex", alignItems: "center", gap: theme.spacing.sm }}>
            <input type="checkbox" checked={note.done} onChange={() => toggle(note)} style={{ accentColor: theme.colors.primary }} />
            <span
              style={{
                flex: 1,
                fontSize: theme.typography.sizes.sm,
                color: note.done ? theme.colors.textSecondary : theme.colors.textPrimary,
                textDecoration: note.done ? "line-through" : "none",
              }}
            >
              {note.content}
            </span>
            <button
              onClick={() => remove(note.id)}
              style={{ background: "none", border: "none", color: theme.colors.textSecondary, cursor: "pointer", fontSize: theme.typography.sizes.xs }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
