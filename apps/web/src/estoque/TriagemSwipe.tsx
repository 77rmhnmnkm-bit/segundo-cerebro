import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EstoqueLote, MotivoDescarte } from "@app/core";
import { MOTIVOS_DESCARTE } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { descartarEstoqueLote, getEstoqueLotes } from "../api";

const ROTULO_MOTIVO: Record<MotivoDescarte, string> = {
  vencido: "Vencido",
  danificado: "Danificado",
  contaminado: "Contaminado",
  perdido: "Perdido",
  devolvido: "Devolvido",
};

const LIMIAR = 110; // px de arrasto para valer como decisão
const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

// Triagem rápida estilo "Tinder": um lote vencido por vez, arraste para a
// esquerda para descartar (pede o motivo) ou para a direita para manter
// (pula, sem mexer no dado — útil quando ainda vai usar apesar da validade
// impressa). Resolve o mesmo atrito de "a lista inteira recarrega e eu perco
// o lugar" a cada item — aqui não existe lista, só o próximo card.
export function TriagemSwipe({ onFechar, onAlgumaMudanca }: { onFechar: () => void; onAlgumaMudanca: () => void }) {
  const { theme } = useTheme();
  const [fila, setFila] = useState<EstoqueLote[] | null>(null);
  const [indice, setIndice] = useState(0);
  const [dx, setDx] = useState(0);
  const [saindo, setSaindo] = useState<"esquerda" | "direita" | null>(null);
  const [motivoAberto, setMotivoAberto] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [mudouAlgo, setMudouAlgo] = useState(false);
  const arrastoRef = useRef<{ x0: number; ativo: boolean }>({ x0: 0, ativo: false });

  useEffect(() => {
    getEstoqueLotes({ vencidos: true, limite: 200 }).then((r) => setFila(r.lotes));
  }, []);

  const atual = fila?.[indice] ?? null;
  const restantes = fila ? fila.length - indice : 0;

  function fechar() {
    if (mudouAlgo) onAlgumaMudanca();
    onFechar();
  }

  function avancar() {
    setDx(0);
    setSaindo(null);
    setMotivoAberto(false);
    setIndice((i) => i + 1);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (processando || motivoAberto) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    arrastoRef.current = { x0: e.clientX, ativo: true };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!arrastoRef.current.ativo) return;
    setDx(e.clientX - arrastoRef.current.x0);
  }
  function onPointerUp() {
    if (!arrastoRef.current.ativo) return;
    arrastoRef.current.ativo = false;
    if (dx <= -LIMIAR) {
      setSaindo("esquerda");
      setMotivoAberto(true);
    } else if (dx >= LIMIAR) {
      setSaindo("direita");
      setTimeout(avancar, 160);
    } else {
      setDx(0);
    }
  }

  async function confirmarDescarte(motivo: MotivoDescarte) {
    if (!atual) return;
    setProcessando(true);
    try {
      await descartarEstoqueLote(atual.id, motivo);
      setMudouAlgo(true);
      avancar();
    } finally {
      setProcessando(false);
    }
  }

  function cancelarMotivo() {
    setMotivoAberto(false);
    setSaindo(null);
    setDx(0);
  }

  const rot = Math.max(-14, Math.min(14, dx / 10));
  const corIndicador = dx < 0 ? theme.colors.danger : theme.colors.success;
  const forcaIndicador = Math.min(1, Math.abs(dx) / LIMIAR);

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: theme.mode === "light" ? "rgba(20,22,28,0.55)" : "rgba(0,0,0,0.7)",
        backdropFilter: "blur(6px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: theme.spacing.lg,
      }}
    >
      <div style={{ width: "100%", maxWidth: 420, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: theme.spacing.md }}>
        <div style={{ color: "#fff", fontSize: theme.typography.sizes.sm, fontWeight: 600 }}>
          🗑 Triagem de vencidos {fila && atual ? `— ${restantes} restante${restantes === 1 ? "" : "s"}` : ""}
        </div>
        <button
          type="button"
          onClick={fechar}
          style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: 999, cursor: "pointer", fontSize: 14 }}
        >
          ✕
        </button>
      </div>

      <div style={{ position: "relative", width: "100%", maxWidth: 420, flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {!fila && <div style={{ color: "#fff" }}>Carregando…</div>}

        {fila && !atual && (
          <div style={{ ...glassSurface(theme, { strong: true, radius: theme.radius.lg }), padding: theme.spacing.xl, textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: theme.typography.sizes.lg, fontWeight: 700, color: theme.colors.textPrimary, marginBottom: 6 }}>
              Tudo revisado
            </div>
            <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary, marginBottom: theme.spacing.lg }}>
              Você passou por todos os lotes vencidos com estoque físico.
            </div>
            <button
              type="button"
              onClick={fechar}
              style={{ padding: "9px 18px", borderRadius: theme.radius.sm, border: "none", background: theme.colors.primary, color: "#fff", fontWeight: 600, cursor: "pointer" }}
            >
              Fechar
            </button>
          </div>
        )}

        {atual && (
          <>
            {/* indicadores de intenção atrás do card */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: dx < 0 ? "flex-start" : "flex-end",
                padding: 24,
                pointerEvents: "none",
                opacity: forcaIndicador,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 800, color: corIndicador, border: `2px solid ${corIndicador}`, borderRadius: 10, padding: "6px 14px", transform: `rotate(${dx < 0 ? -10 : 10}deg)` }}>
                {dx < 0 ? "DESCARTAR" : "MANTER"}
              </div>
            </div>

            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                ...glassSurface(theme, { strong: true, radius: theme.radius.lg }),
                width: "100%",
                padding: theme.spacing.lg,
                cursor: motivoAberto ? "default" : "grab",
                touchAction: "none",
                userSelect: "none",
                transform: saindo
                  ? `translateX(${saindo === "esquerda" ? "-140%" : "140%"}) rotate(${saindo === "esquerda" ? -18 : 18}deg)`
                  : `translateX(${dx}px) rotate(${rot}deg)`,
                transition: arrastoRef.current.ativo ? "none" : "transform 220ms ease",
                opacity: saindo ? 0 : 1,
              }}
            >
              <h3 style={{ margin: "0 0 2px", fontSize: 17, fontWeight: 700, color: theme.colors.textPrimary }}>{atual.nome}</h3>
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: theme.colors.textSecondary }}>
                {atual.marca ?? "—"}
                {atual.lote ? ` · lote ${atual.lote}` : ""}
              </p>
              <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: "0 0 12px", fontSize: 13.5 }}>
                <dt style={{ color: theme.colors.textSecondary }}>Validade</dt>
                <dd style={{ margin: 0, textAlign: "right", fontFamily: "ui-monospace, monospace", color: theme.colors.danger, fontWeight: 600 }}>{br(atual.validade)}</dd>
                <dt style={{ color: theme.colors.textSecondary }}>Em estoque</dt>
                <dd style={{ margin: 0, textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{atual.quantidade} {atual.unidade}</dd>
                <dt style={{ color: theme.colors.textSecondary }}>Local</dt>
                <dd style={{ margin: 0, textAlign: "right" }}>{atual.local ?? "—"}</dd>
                <dt style={{ color: theme.colors.textSecondary }}>Especialidade</dt>
                <dd style={{ margin: 0, textAlign: "right" }}>{atual.especialidade}</dd>
              </dl>
              {atual.observacoes && (
                <p style={{ fontSize: 11.5, color: theme.colors.textSecondary, lineHeight: 1.4, margin: "0 0 4px" }}>{atual.observacoes}</p>
              )}

              {!motivoAberto && (
                <div style={{ display: "flex", gap: 10, marginTop: theme.spacing.md }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSaindo("esquerda");
                      setMotivoAberto(true);
                    }}
                    style={{ flex: 1, padding: "10px 0", borderRadius: theme.radius.sm, border: `1px solid ${theme.colors.danger}`, background: "transparent", color: theme.colors.danger, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
                  >
                    🗑 Descartar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSaindo("direita");
                      setTimeout(avancar, 160);
                    }}
                    style={{ flex: 1, padding: "10px 0", borderRadius: theme.radius.sm, border: `1px solid ${theme.colors.success}`, background: "transparent", color: theme.colors.success, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
                  >
                    ✓ Manter
                  </button>
                </div>
              )}
            </div>

            {motivoAberto && (
              <div
                style={{
                  ...glassSurface(theme, { strong: true, radius: theme.radius.lg }),
                  position: "absolute",
                  inset: "auto 0 0 0",
                  padding: theme.spacing.lg,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 13, color: theme.colors.textPrimary, fontWeight: 600 }}>Motivo do descarte:</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {MOTIVOS_DESCARTE.map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={processando}
                      onClick={() => confirmarDescarte(m)}
                      style={{ padding: "7px 12px", borderRadius: 999, border: `1px solid ${theme.colors.danger}`, background: `${theme.colors.danger}18`, color: theme.colors.danger, cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}
                    >
                      {ROTULO_MOTIVO[m]}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={cancelarMotivo} style={{ alignSelf: "flex-end", background: "none", border: "none", color: theme.colors.textSecondary, cursor: "pointer", fontSize: 12 }}>
                  Cancelar
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: theme.spacing.sm, textAlign: "center" }}>
        Arraste para a esquerda para descartar, para a direita para manter.
      </div>
    </div>,
    document.body,
  );
}
