import { useEffect, useState } from "react";
import type { DentalUpdate } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { listDentalUpdates, refreshDentalUpdates } from "../api";

const CATEGORY_FILTERS: { key: string | undefined; label: string }[] = [
  { key: "clinico", label: "Clínico/científico" },
  { key: undefined, label: "Todas" },
  { key: "politico", label: "Institucional/político" },
];

const EVIDENCE_FILTERS: { key: string | undefined; label: string }[] = [
  { key: undefined, label: "Toda evidência" },
  { key: "comprovado", label: "Só comprovado" },
  { key: "novidade", label: "Novidades" },
];

export function UpdatesWidget() {
  const { theme } = useTheme();
  const [updates, setUpdates] = useState<DentalUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<string | undefined>("clinico");
  const [evidence, setEvidence] = useState<string | undefined>(undefined);
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    listDentalUpdates(category, evidence)
      .then(({ updates }) => setUpdates(updates))
      .finally(() => setLoading(false));
  }, [category, evidence]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshDentalUpdates();
      const { updates } = await listDentalUpdates(category, evidence);
      setUpdates(updates);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div
      style={{
        ...glassSurface(theme),
        padding: theme.spacing.lg,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        maxHeight: 380,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: theme.spacing.sm }}>
        <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
          Atualizações e Novidades na Odontologia
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{ background: "none", border: "none", color: theme.colors.primary, fontSize: theme.typography.sizes.xs, cursor: "pointer" }}
        >
          {refreshing ? "Buscando..." : "↻ Atualizar"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
        {CATEGORY_FILTERS.map((f) => {
          const active = f.key === category;
          return (
            <button
              key={f.label}
              onClick={() => setCategory(f.key)}
              style={{
                background: active ? theme.colors.primary : "transparent",
                color: active ? "#fff" : theme.colors.textSecondary,
                border: `1px solid ${active ? theme.colors.primary : theme.glass.borderSoft}`,
                borderRadius: theme.radius.sm,
                padding: "2px 8px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: theme.spacing.sm, flexWrap: "wrap" }}>
        {EVIDENCE_FILTERS.map((f) => {
          const active = f.key === evidence;
          return (
            <button
              key={f.label}
              onClick={() => setEvidence(f.key)}
              style={{
                background: active ? theme.colors.categoryAcademico : "transparent",
                color: active ? "#fff" : theme.colors.textSecondary,
                border: `1px solid ${active ? theme.colors.categoryAcademico : theme.glass.borderSoft}`,
                borderRadius: theme.radius.sm,
                padding: "2px 8px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {loading && <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>Carregando...</div>}

      {!loading && updates.length === 0 && (
        <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>Nenhuma novidade por agora.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", flex: 1, minHeight: 0 }}>
        {updates.map((u) => {
          const original = showOriginal[u.id];
          return (
            <div key={u.id} style={{ borderBottom: `1px solid ${theme.glass.borderSoft}`, paddingBottom: 6 }}>
              <a
                href={u.link}
                target="_blank"
                rel="noreferrer"
                style={{ display: "block", fontSize: theme.typography.sizes.xs, color: theme.colors.textPrimary, textDecoration: "none" }}
              >
                {original && u.title_original ? u.title_original : u.title}
              </a>
              <div style={{ color: theme.colors.textSecondary, marginTop: 2, fontSize: 10, display: "flex", gap: 6, alignItems: "center" }}>
                <span>
                  {u.source_name}
                  {u.published_at ? ` · ${new Date(u.published_at).toLocaleDateString("pt-BR")}` : ""}
                </span>
                {u.title_original && (
                  <button
                    onClick={() => setShowOriginal((prev) => ({ ...prev, [u.id]: !prev[u.id] }))}
                    style={{ background: "none", border: "none", color: theme.colors.primary, cursor: "pointer", fontSize: 10, padding: 0 }}
                  >
                    {original ? "ver tradução" : "ver original"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 10, color: theme.colors.textSecondary, marginTop: theme.spacing.sm }}>
        Fontes oficiais verificadas: PubMed, CFO, ANVISA, FDI, BDJ, EFP, IADR. Nenhuma notícia/podcast.
      </div>
    </div>
  );
}
