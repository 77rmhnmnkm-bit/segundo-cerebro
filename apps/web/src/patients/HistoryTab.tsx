import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Patient, PatientAuditLogEntry } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { listAuditLog } from "../api";

const ACTION_LABELS: Record<string, string> = {
  criado: "Criado",
  excluido: "Excluído",
  impresso: "Impresso",
};

export function HistoryTab({ patient }: { patient: Patient }) {
  const { theme } = useTheme();
  const [log, setLog] = useState<PatientAuditLogEntry[]>([]);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    listAuditLog(patient.id).then(({ log }) => setLog(log));
  }, [patient.id]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: theme.spacing.md }}>
        <div>
          <div style={{ fontSize: theme.typography.sizes.lg, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
            Histórico de ações
          </div>
          <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
            Registro permanente — toda exclusão e impressão fica aqui e não pode ser editada ou apagada.
          </div>
        </div>
        {log.length > 0 && (
          <button
            onClick={() => setPrinting(true)}
            style={{
              background: theme.colors.primary,
              color: "#fff",
              border: "none",
              borderRadius: theme.radius.sm,
              padding: `${theme.spacing.xs + 2}px ${theme.spacing.md}px`,
              fontSize: theme.typography.sizes.sm,
              cursor: "pointer",
            }}
          >
            Imprimir histórico
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
        {log.length === 0 && <div style={{ color: theme.colors.textSecondary, textAlign: "center" }}>Nenhuma ação registrada ainda.</div>}
        {log.map((entry) => (
          <div key={entry.id} style={{ ...glassSurface(theme), padding: theme.spacing.sm, display: "flex", justifyContent: "space-between", gap: theme.spacing.md }}>
            <div>
              <span
                style={{
                  fontSize: theme.typography.sizes.xs,
                  fontWeight: theme.typography.weights.semibold,
                  color:
                    entry.action === "excluido" ? theme.colors.danger : entry.action === "impresso" ? theme.colors.primary : theme.colors.textPrimary,
                  marginRight: 6,
                }}
              >
                {ACTION_LABELS[entry.action] ?? entry.action}
              </span>
              <span style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary }}>{entry.description}</span>
            </div>
            <span style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, whiteSpace: "nowrap" }}>
              {new Date(entry.created_at).toLocaleString("pt-BR")}
            </span>
          </div>
        ))}
      </div>

      {printing && <HistoryPrint patient={patient} log={log} onClose={() => setPrinting(false)} />}
    </div>
  );
}

function HistoryPrint({ patient, log, onClose }: { patient: Patient; log: PatientAuditLogEntry[]; onClose: () => void }) {
  return createPortal(
    <div className="sc-print-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`
        @media print {
          @page { size: A4; margin: 1.8cm; }
          body * { visibility: hidden; }
          .sc-print-doc, .sc-print-doc * { visibility: visible; }
          .sc-print-doc { position: absolute; top: 0; left: 0; width: 100%; box-shadow: none !important; }
          .sc-no-print { display: none !important; }
        }
      `}</style>
      <div
        className="sc-print-doc"
        style={{
          background: "#fff",
          color: "#1a1a1a",
          width: "21cm",
          minHeight: "29.7cm",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          padding: "2cm",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <div style={{ textAlign: "center", borderBottom: "2px solid #1a1a1a", paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>Histórico de ações do paciente</div>
          <div style={{ fontSize: 14, color: "#444", marginTop: 4 }}>{patient.name}</div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Emitido em {new Date().toLocaleString("pt-BR")}</div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #999" }}>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Data</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Ação</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Descrição</th>
            </tr>
          </thead>
          <tbody>
            {log.map((entry) => (
              <tr key={entry.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "6px 8px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                  {new Date(entry.created_at).toLocaleString("pt-BR")}
                </td>
                <td style={{ padding: "6px 8px", verticalAlign: "top" }}>{ACTION_LABELS[entry.action] ?? entry.action}</td>
                <td style={{ padding: "6px 8px", verticalAlign: "top" }}>{entry.description}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 40, fontSize: 11, color: "#777", textAlign: "center" }}>
          Este registro é gerado automaticamente e não pode ser editado ou apagado pelo sistema.
        </div>

        <div className="sc-no-print" style={{ display: "flex", gap: 8, marginTop: 32, justifyContent: "center" }}>
          <button onClick={() => window.print()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#0E7C7B", color: "#fff", cursor: "pointer" }}>
            Imprimir
          </button>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", background: "transparent", cursor: "pointer" }}>
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
