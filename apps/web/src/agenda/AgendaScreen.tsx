import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CalendarEvent, EventCategory, EventDraft } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { GlassModal } from "../GlassModal";
import { TextField, SelectField, PrimaryButton } from "../FormField";
import { createEvent, deleteEvent, extractEvent, extractEventFromFile, listEvents, updateEventConfirmation } from "../api";
import { VoiceButton } from "../VoiceButton";

const CATEGORY_LABEL: Record<EventCategory, string> = {
  atendimento_paciente: "Atendimento",
  pessoal: "Pessoal",
  academico: "Acadêmico",
};

// Mirrors the same fix applied on the backend: toISOString() converts to UTC
// first, which silently rolls the calendar date over for late-evening local
// times (Brazil is UTC-3) — read local y/m/d components instead.
function toLocalDateInputValue(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildWhatsAppLink(event: CalendarEvent): string {
  const digits = (event.patient_phone ?? "").replace(/\D/g, "");
  const phone = digits.length <= 11 ? `55${digits}` : digits; // assume BR number if no country code
  const date = new Date(event.start_at);
  const dateStr = date.toLocaleDateString("pt-BR");
  const timeStr = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const firstName = (event.patient_name ?? "").split(" ")[0];
  const message = `Olá${firstName ? ` ${firstName}` : ""}! Confirmando sua consulta "${event.title}" no dia ${dateStr} às ${timeStr}${
    event.location_text ? ` em ${event.location_text}` : ""
  }. Você confirma a presença?`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

const emptyForm = {
  title: "",
  category: "pessoal" as EventCategory,
  date: "",
  time: "",
  locationText: "",
  locationLat: undefined as number | undefined,
  locationLng: undefined as number | undefined,
  travelMinutes: "",
  prepMinutes: "90",
  source: "manual" as "manual" | "ai_text" | "ai_photo",
  rawInput: undefined as string | undefined,
};

export function AgendaScreen() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategories, setActiveCategories] = useState<Set<EventCategory>>(
    new Set(["atendimento_paciente", "pessoal", "academico"]),
  );
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  function categoryColor(category: EventCategory) {
    if (category === "atendimento_paciente") return theme.colors.categoryAtendimento;
    if (category === "pessoal") return theme.colors.categoryPessoal;
    return theme.colors.categoryAcademico;
  }

  async function refresh() {
    setLoading(true);
    try {
      const from = new Date();
      from.setDate(from.getDate() - 1);
      const { events } = await listEvents({ from: from.toISOString() });
      setEvents(events);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function toggleCategory(category: EventCategory) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  const visibleEvents = useMemo(
    () => events.filter((e) => activeCategories.has(e.category)),
    [events, activeCategories],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of visibleEvents) {
      const key = new Date(event.start_at).toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    }
    return Array.from(map.entries());
  }, [visibleEvents]);

  async function handleCreate() {
    if (!form.title || !form.date || !form.time) return;
    const startAt = new Date(`${form.date}T${form.time}:00`).toISOString();
    await createEvent({
      title: form.title,
      category: form.category,
      startAt,
      locationText: form.locationText || undefined,
      locationLat: form.locationLat,
      locationLng: form.locationLng,
      travelMinutes: form.travelMinutes ? Number(form.travelMinutes) : undefined,
      prepMinutes: form.prepMinutes ? Number(form.prepMinutes) : undefined,
      source: form.source,
      rawInput: form.rawInput,
    });
    setForm(emptyForm);
    setShowForm(false);
    refresh();
  }

  async function handleExtract() {
    if (!aiText.trim()) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const { draft, rawInput } = await extractEvent(aiText);
      applyDraft(draft, rawInput, "ai_text");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Erro ao extrair evento.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleExtractFile(file: File) {
    setAiLoading(true);
    setAiError(null);
    try {
      const { draft, rawInput } = await extractEventFromFile(file);
      applyDraft(draft, rawInput, "ai_photo");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Erro ao processar o arquivo.");
    } finally {
      setAiLoading(false);
    }
  }

  function applyDraft(draft: EventDraft, rawInput: string, source: "ai_text" | "ai_photo") {
    const start = new Date(draft.startAt);
    setForm({
      title: draft.title,
      category: draft.category,
      date: toLocalDateInputValue(start),
      time: start.toTimeString().slice(0, 5),
      locationText: draft.locationText ?? "",
      locationLat: draft.locationLat,
      locationLng: draft.locationLng,
      travelMinutes: draft.travelMinutes !== undefined ? String(draft.travelMinutes) : "",
      prepMinutes: "90",
      source,
      rawInput,
    });
    setShowAiModal(false);
    setAiText("");
    setShowForm(true);
  }

  async function handleDelete(id: string) {
    await deleteEvent(id);
    refresh();
  }

  async function handleConfirmationChange(id: string, status: "pendente" | "confirmado" | "falta") {
    await updateEventConfirmation(id, status);
    refresh();
  }

  return (
    <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", padding: theme.spacing.xl }}>
      <header
        style={{
          ...glassSurface(theme, { radius: theme.radius.lg }),
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: theme.spacing.md,
          padding: `${theme.spacing.md}px ${theme.spacing.lg}px`,
          marginBottom: theme.spacing.xl,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.md }}>
          <button
            onClick={() => navigate("/")}
            aria-label="Voltar"
            style={{ border: "none", background: "transparent", color: theme.colors.textSecondary, fontSize: theme.typography.sizes.lg, cursor: "pointer" }}
          >
            ←
          </button>
          <div>
            <div
              style={{
                fontSize: theme.typography.sizes.xl,
                fontWeight: theme.typography.weights.bold,
                letterSpacing: theme.typography.tracking.tight,
                color: theme.colors.textPrimary,
              }}
            >
              Agenda
            </div>
            <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>
              Próximos compromissos, por categoria.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: theme.spacing.sm }}>
          {(Object.keys(CATEGORY_LABEL) as EventCategory[]).map((cat) => {
            const active = activeCategories.has(cat);
            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  border: `1px solid ${active ? categoryColor(cat) : theme.glass.borderSoft}`,
                  background: active ? `${categoryColor(cat)}1f` : "transparent",
                  color: active ? theme.colors.textPrimary : theme.colors.textSecondary,
                  borderRadius: theme.radius.full,
                  padding: `${theme.spacing.xs + 2}px ${theme.spacing.sm + 4}px`,
                  fontSize: theme.typography.sizes.xs,
                  cursor: "pointer",
                  transition: `all ${theme.motion.fast}ms`,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: 999, background: categoryColor(cat) }} />
                {CATEGORY_LABEL[cat]}
              </button>
            );
          })}
        </div>
      </header>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
        <button
          onClick={() => setShowAiModal(true)}
          style={{
            background: theme.mode === "light" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.08)",
            border: `1px solid ${theme.glass.borderSoft}`,
            color: theme.colors.textPrimary,
            borderRadius: theme.radius.md,
            padding: `${theme.spacing.sm + 2}px ${theme.spacing.md}px`,
            fontSize: theme.typography.sizes.md,
            fontWeight: theme.typography.weights.medium,
            cursor: "pointer",
          }}
        >
          ✦ Criar com IA
        </button>
        <PrimaryButton
          onClick={() => {
            setForm(emptyForm);
            setShowForm(true);
          }}
        >
          + Novo evento
        </PrimaryButton>
      </div>

      {loading && <div style={{ color: theme.colors.textSecondary }}>Carregando...</div>}

      {!loading && grouped.length === 0 && (
        <div style={{ ...glassSurface(theme), padding: theme.spacing.lg, color: theme.colors.textSecondary, textAlign: "center" }}>
          Nenhum compromisso por aqui.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.lg }}>
        {grouped.map(([day, dayEvents]) => (
          <div key={day}>
            <div
              style={{
                fontSize: theme.typography.sizes.sm,
                fontWeight: theme.typography.weights.semibold,
                color: theme.colors.textSecondary,
                marginBottom: theme.spacing.sm,
                textTransform: "capitalize",
              }}
            >
              {day}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
              {dayEvents.map((event) => (
                <div
                  key={event.id}
                  style={{
                    ...glassSurface(theme),
                    padding: theme.spacing.md,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: theme.spacing.md,
                    borderLeft: `3px solid ${categoryColor(event.category)}`,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
                      {event.title}
                    </div>
                    <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary }}>
                      {new Date(event.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {event.location_text ? ` · ${event.location_text}` : ""}
                    </div>
                    {event.notify_at && (
                      <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginTop: 2 }}>
                        Aviso: {new Date(event.notify_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.sm, flexWrap: "wrap" }}>
                    {event.patient_id && (
                      <>
                        {event.patient_phone && (
                          <a
                            href={buildWhatsAppLink(event)}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              background: "#25D366",
                              color: "#fff",
                              border: "none",
                              borderRadius: theme.radius.sm,
                              padding: `${theme.spacing.xs}px ${theme.spacing.sm}px`,
                              fontSize: theme.typography.sizes.xs,
                              textDecoration: "none",
                            }}
                          >
                            WhatsApp
                          </a>
                        )}
                        <select
                          value={event.confirmation_status ?? "pendente"}
                          onChange={(e) => handleConfirmationChange(event.id, e.target.value as "pendente" | "confirmado" | "falta")}
                          style={{
                            background: "transparent",
                            border: `1px solid ${theme.glass.borderSoft}`,
                            borderRadius: theme.radius.sm,
                            color:
                              event.confirmation_status === "confirmado"
                                ? theme.colors.primary
                                : event.confirmation_status === "falta"
                                  ? theme.colors.danger
                                  : theme.colors.textSecondary,
                            padding: `${theme.spacing.xs}px ${theme.spacing.sm}px`,
                            fontSize: theme.typography.sizes.xs,
                          }}
                        >
                          <option value="pendente">Pendente</option>
                          <option value="confirmado">Confirmado</option>
                          <option value="falta">Faltou</option>
                        </select>
                      </>
                    )}
                    <button
                      onClick={() => handleDelete(event.id)}
                      style={{
                        background: "transparent",
                        border: `1px solid ${theme.glass.borderSoft}`,
                        color: theme.colors.textSecondary,
                        borderRadius: theme.radius.sm,
                        padding: `${theme.spacing.xs}px ${theme.spacing.sm}px`,
                        fontSize: theme.typography.sizes.xs,
                        cursor: "pointer",
                      }}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <GlassModal title="Novo evento" onClose={() => setShowForm(false)}>
          <TextField label="Título" value={form.title} onChange={(v) => setForm({ ...form, title: v })} required />
          <SelectField
            label="Categoria"
            value={form.category}
            onChange={(v) => setForm({ ...form, category: v })}
            options={[
              { value: "atendimento_paciente", label: "Atendimento" },
              { value: "pessoal", label: "Pessoal" },
              { value: "academico", label: "Acadêmico" },
            ]}
          />
          <TextField label="Data" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} required />
          <TextField label="Hora" type="time" value={form.time} onChange={(v) => setForm({ ...form, time: v })} required />
          <TextField label="Local" value={form.locationText} onChange={(v) => setForm({ ...form, locationText: v })} />
          <TextField
            label="Tempo de deslocamento (min)"
            type="number"
            value={form.travelMinutes}
            onChange={(v) => setForm({ ...form, travelMinutes: v })}
          />
          <TextField
            label="Tempo de preparo (min)"
            type="number"
            value={form.prepMinutes}
            onChange={(v) => setForm({ ...form, prepMinutes: v })}
          />
          {form.source !== "manual" && (
            <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
              ✦ Preenchido pela IA a partir d{form.source === "ai_photo" ? "o seu print/foto/PDF" : "o seu texto"} — revise antes de salvar.
              {form.rawInput && form.source === "ai_photo" && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ cursor: "pointer" }}>Ver texto lido</summary>
                  <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{form.rawInput}</div>
                </details>
              )}
            </div>
          )}
          <PrimaryButton onClick={handleCreate} disabled={!form.title || !form.date || !form.time}>
            Salvar evento
          </PrimaryButton>
        </GlassModal>
      )}

      {showAiModal && (
        <GlassModal title="Criar evento com IA" onClose={() => setShowAiModal(false)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: theme.spacing.sm }}>
            <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary }}>
              Descreva o compromisso em texto livre — a IA identifica título, categoria, data e hora. Você revisa e confirma antes de salvar.
            </div>
            <VoiceButton compact onTranscribed={(t) => setAiText((prev) => (prev ? `${prev} ${t}` : t))} />
          </div>
          <textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            placeholder='Ex: "consulta com a paciente Maria sexta às 14h" ou "prova de endodontia dia 30 às 8h"'
            rows={4}
            style={{
              background: theme.mode === "light" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${theme.glass.borderSoft}`,
              borderRadius: theme.radius.sm,
              padding: theme.spacing.sm,
              fontSize: theme.typography.sizes.md,
              color: theme.colors.textPrimary,
              outline: "none",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
          {aiError && <div style={{ color: theme.colors.danger, fontSize: theme.typography.sizes.sm }}>{aiError}</div>}
          <PrimaryButton onClick={handleExtract} disabled={!aiText.trim() || aiLoading}>
            {aiLoading ? "Analisando..." : "Analisar texto"}
          </PrimaryButton>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: theme.spacing.sm,
              color: theme.colors.textSecondary,
              fontSize: theme.typography.sizes.xs,
            }}
          >
            <div style={{ flex: 1, height: 1, background: theme.glass.borderSoft }} />
            ou
            <div style={{ flex: 1, height: 1, background: theme.glass.borderSoft }} />
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: theme.spacing.sm,
              border: `1px dashed ${theme.glass.borderSoft}`,
              borderRadius: theme.radius.md,
              padding: theme.spacing.md,
              color: theme.colors.textSecondary,
              fontSize: theme.typography.sizes.sm,
              cursor: aiLoading ? "default" : "pointer",
              textAlign: "center",
            }}
          >
            {aiLoading ? "Processando..." : "📎 Enviar print, foto ou PDF"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              disabled={aiLoading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleExtractFile(file);
                e.target.value = "";
              }}
              style={{ display: "none" }}
            />
          </label>
          <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, textAlign: "center" }}>
            Aceita arquivos grandes — print, foto ou PDF de raio-X, por exemplo.
          </div>
        </GlassModal>
      )}
    </div>
  );
}
