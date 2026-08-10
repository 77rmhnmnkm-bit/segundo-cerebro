import { type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Patient } from "@app/core";
import { logAuditAction } from "../api";

export function PatientPrintModal({
  patient,
  title,
  children,
  onClose,
}: {
  patient: Patient;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  async function handlePrint(purpose: "entrega" | "interno") {
    await logAuditAction(patient.id, {
      action: "impresso",
      entityType: "prontuario",
      description: `"${title}" impresso (${purpose === "entrega" ? "entregue ao paciente" : "armazenamento interno"})`,
    });
    window.print();
  }

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
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>{title}</div>
          <div style={{ fontSize: 14, color: "#444", marginTop: 4 }}>{patient.name}</div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Emitido em {new Date().toLocaleString("pt-BR")}</div>
        </div>

        <div style={{ fontSize: 13, lineHeight: 1.6 }}>{children}</div>

        <div className="sc-no-print" style={{ display: "flex", gap: 8, marginTop: 32, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => handlePrint("entrega")} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#0E7C7B", color: "#fff", cursor: "pointer" }}>
            Imprimir para entregar ao paciente
          </button>
          <button onClick={() => handlePrint("interno")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #0E7C7B", background: "transparent", color: "#0E7C7B", cursor: "pointer" }}>
            Imprimir para arquivo interno
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

export function PrintSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 24, breakInside: "avoid" }}>
      <div style={{ fontSize: 15, fontWeight: 700, borderBottom: "1px solid #999", paddingBottom: 4, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
