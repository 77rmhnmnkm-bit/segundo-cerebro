import type { EstoqueLote } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { LoteResumo } from "./LoteCard";

export type AcaoRapida = "entrada" | "saida" | "historico" | "descartar";

// Card flutuante do hover: mesmo corpo de informação da gaveta (LoteResumo)
// mais, no rodapé, as ações rápidas do protótipo aprovado — Entrada / Saída /
// Histórico e, só quando há saldo físico, "Descartar tudo (N)" em vermelho e
// separado das demais. Nada aqui executa movimento de verdade ainda (isso é
// outra tarefa); o clique só avisa "em breve" via toast, no callback do chamador.
export function LoteHoverCard({
  lote,
  onAcao,
}: {
  lote: EstoqueLote;
  onAcao: (acao: AcaoRapida, lote: EstoqueLote) => void;
}) {
  const { theme } = useTheme();

  const botao: React.CSSProperties = {
    flex: 1,
    padding: "7px 0",
    fontSize: 12.5,
    fontWeight: 500,
    textAlign: "center",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.glass.borderSoft}`,
    background: theme.glass.surface,
    color: theme.colors.textPrimary,
    cursor: "pointer",
    font: "inherit",
  };

  return (
    <div
      role="dialog"
      aria-label={`Ações rápidas de ${lote.nome}`}
      style={{
        ...glassSurface(theme, { strong: true, radius: theme.radius.md }),
        width: 300,
        maxWidth: "calc(100vw - 16px)",
        padding: "15px 17px",
        boxShadow: `0 18px 46px ${theme.glass.shadow}`,
      }}
    >
      <LoteResumo lote={lote} />
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" style={botao} onClick={() => onAcao("entrada", lote)}>
          Entrada
        </button>
        <button type="button" style={botao} onClick={() => onAcao("saida", lote)}>
          Saída
        </button>
        <button type="button" style={botao} onClick={() => onAcao("historico", lote)}>
          Histórico
        </button>
      </div>
      {lote.quantidade > 0 && (
        <div style={{ marginTop: 6 }}>
          <button
            type="button"
            style={{
              ...botao,
              width: "100%",
              color: theme.colors.danger,
              borderColor: theme.colors.danger,
            }}
            onClick={() => onAcao("descartar", lote)}
          >
            Descartar tudo ({lote.quantidade})
          </button>
        </div>
      )}
    </div>
  );
}
