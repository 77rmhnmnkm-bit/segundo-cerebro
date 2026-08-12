import type { EstoqueLote } from "@app/core";
import { useTheme } from "../ThemeProvider";
import { corStatus, etiqueta } from "./LoteRow";

export function LoteTile({
  lote,
  onAbrir,
  index = 0,
  ativo = false,
}: {
  lote: EstoqueLote;
  onAbrir: (l: EstoqueLote) => void;
  index?: number;
  ativo?: boolean;
}) {
  const { theme } = useTheme();
  const cor = corStatus(theme, lote.status);
  return (
    <button
      type="button"
      // Fundo/borda (padrão, hover, aberto) definidos no <style> de
      // EstoqueScreen — mesmo motivo do LoteRow: inline sempre venceria :hover.
      className={`lr-tile lr-in${ativo ? " lr-row-open" : ""}`}
      onClick={() => onAbrir(lote)}
      onPointerEnter={() => onAbrir(lote)}
      aria-expanded={ativo}
      style={{
        borderRadius: theme.radius.md,
        padding: 12,
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        // Altura FIXA (não minHeight): antes cada bloco crescia com o
        // próprio conteúdo — nome de 1 linha dava um bloco baixo, nome de 2
        // linhas dava um bloco mais alto, marca longa dava um terceiro
        // tamanho. Fixando a altura e reservando o espaço de cada linha
        // (nome sempre com as 2 linhas do line-clamp reservadas, marca
        // sempre 1 linha com reticências) todos os blocos ficam idênticos
        // independente do texto.
        height: 132,
        // width:100% — sem isso o <button> (inline-block por padrão) encolhe
        // para o conteúdo em vez de ocupar a coluna inteira da grade: dois
        // blocos na mesma fileira acabavam com LARGURAS diferentes (ex.: um
        // com badge "vencido" ficava mais estreito que o vizinho com "no
        // prazo"), quebrando a mesma exigência de "todo bloco igual" que
        // motivou fixar a altura.
        width: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        cursor: "pointer",
        color: theme.colors.textPrimary,
        animationDelay: `${Math.min(index * 14, 200)}ms`,
      }}
    >
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          lineHeight: 1.32,
          height: "2.64em",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {lote.nome}
        {lote.precisaConferencia && (
          <span aria-label="falta informação" style={{ color: theme.colors.warning, fontWeight: 700 }}>
            {" "}
            !
          </span>
        )}
      </span>
      <span
        style={{
          fontSize: 10.5,
          color: theme.colors.textSecondary,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {lote.marca ?? "—"}
      </span>
      <span
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: 21,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          marginTop: "auto",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {lote.quantidade || 0}
        <i style={{ fontStyle: "normal", fontSize: 11, fontWeight: 400, color: theme.colors.textSecondary, marginLeft: 3 }}>
          {lote.unidade}
        </i>
      </span>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flex: "none" }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            padding: "3px 8px",
            borderRadius: 6,
            background: `${cor}1F`,
            color: cor,
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {etiqueta(lote)}
        </span>
      </span>
    </button>
  );
}
