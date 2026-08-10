import { useEffect, useState } from "react";
import { CONDITION_FLAGS, type PatientHealth } from "@app/core";
import { useTheme } from "../ThemeProvider";
import { getPatientHealth } from "../api";

// Banner de alerta médico — fica no topo da ficha e grita as condições críticas
// (anticoagulante, bifosfonato/MRONJ, gestante, profilaxia…) e alergias ANTES
// de qualquer procedimento. Vermelho = alta; âmbar = média.
export function MedicalAlertBanner({ patientId, refreshKey }: { patientId: string; refreshKey: number }) {
  const { theme } = useTheme();
  const [health, setHealth] = useState<PatientHealth | null>(null);

  useEffect(() => {
    getPatientHealth(patientId)
      .then(({ health }) => setHealth(health))
      .catch(() => setHealth(null));
  }, [patientId, refreshKey]);

  if (!health) return null;
  const flags = (health.conditions ?? []).map((k) => CONDITION_FLAGS.find((f) => f.key === k)).filter(Boolean) as typeof CONDITION_FLAGS;
  const allergies = health.allergies ?? [];
  if (flags.length === 0 && allergies.length === 0) return null;

  const hasHigh = flags.some((f) => f.severity === "alta") || allergies.length > 0;
  const accent = hasHigh ? theme.colors.danger : "#FF9500";

  return (
    <div
      style={{
        border: `1px solid ${accent}`,
        background: `${accent}14`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.lg,
      }}
    >
      <div style={{ fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.bold, color: accent, marginBottom: 6 }}>
        ⚠ Alertas médicos
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {allergies.map((a) => (
          <span key={`al-${a}`} title="Alergia relatada" style={pill(theme.colors.danger)}>
            💢 Alergia: {a}
          </span>
        ))}
        {flags.map((f) => (
          <span key={f.key} title={`${f.implication}${f.source && f.source !== "—" ? ` (Fonte: ${f.source})` : ""}`} style={pill(f.severity === "alta" ? theme.colors.danger : "#FF9500")}>
            {f.label}
          </span>
        ))}
      </div>
      <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginTop: 8 }}>
        Passe o mouse em cada alerta para ver a conduta recomendada e a fonte. Apoio à decisão — confirme clinicamente.
      </div>
    </div>
  );
}

function pill(color: string): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: `${color}22`, color, border: `1px solid ${color}55`, cursor: "help" };
}
