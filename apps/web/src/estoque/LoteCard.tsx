import { useEffect, useState } from "react";
import type { EstoqueLocal, EstoqueLote, MotivoDescarte } from "@app/core";
import { MOTIVOS_DESCARTE } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import {
  descartarEstoqueLote,
  getEstoqueLoteHistorico,
  getEstoqueLocais,
  movimentarEstoqueLote,
  patchEstoqueLote,
} from "../api";

const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

const ROTULO_MOTIVO: Record<MotivoDescarte, string> = {
  vencido: "Vencido",
  danificado: "Danificado",
  contaminado: "Contaminado",
  perdido: "Perdido",
  devolvido: "Devolvido",
};

// Corpo de informação (nome/marca, tabela de dados e avisos) — extraído para
// ser reaproveitado tanto pela gaveta (LoteCard, informação completa) quanto
// pelo card flutuante do hover (LoteHoverCard, que soma isso a ações rápidas).
export function LoteResumo({ lote }: { lote: EstoqueLote }) {
  const { theme } = useTheme();
  const linha = (rotulo: string, valor: string, cor?: string) => (
    <>
      <dt style={{ color: theme.colors.textSecondary }}>{rotulo}</dt>
      <dd
        style={{
          margin: 0,
          textAlign: "right",
          fontFamily: "ui-monospace, monospace",
          fontVariantNumeric: "tabular-nums",
          color: cor,
        }}
      >
        {valor}
      </dd>
    </>
  );
  const avisoStyle: React.CSSProperties = {
    fontSize: 11.5,
    padding: "8px 10px",
    borderRadius: 9,
    margin: "0 0 11px",
    background: `${theme.colors.warning}24`,
    color: theme.colors.warning,
    lineHeight: 1.45,
  };

  return (
    <>
      <h3 style={{ margin: "0 0 2px", fontSize: 14.5, fontWeight: 600, color: theme.colors.textPrimary }}>{lote.nome}</h3>
      <p style={{ margin: "0 0 11px", fontSize: 11.5, color: theme.colors.textSecondary }}>
        {lote.marca ?? "—"}
        {lote.lote ? ` · lote ${lote.lote}` : ""}
      </p>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "5px 14px",
          margin: "0 0 11px",
          fontSize: 12.5,
        }}
      >
        {linha("Validade", br(lote.validade))}
        {linha("Usar até", br(lote.usarAte), lote.status === "armadilha" ? theme.colors.warning : undefined)}
        {linha("Em estoque", lote.quantidade ? `${lote.quantidade} ${lote.unidade}` : "0")}
        {linha("Local", lote.local ?? "—")}
        {linha("Especialidade", lote.especialidade)}
        {linha("Situação", lote.situacao ?? "—")}
      </dl>
      {lote.diasPerdidos > 0 && (
        <p style={avisoStyle}>
          Vence no recesso. Perde {lote.diasPerdidos} dias de validade — use antes de {br(lote.usarAte)}.
        </p>
      )}
      {lote.precisaConferencia && <p style={avisoStyle}>{lote.conferenciaMotivo.join(" · ")}</p>}
      {lote.observacoes && (
        <p style={{ fontSize: 11.5, margin: "0 0 11px", color: theme.colors.textSecondary, lineHeight: 1.45 }}>
          {lote.observacoes}
        </p>
      )}
    </>
  );
}

type Modo = "ver" | "editar" | "entrada" | "saida" | "descartar" | "historico";

// Gaveta em fluxo: o corpo de informação (LoteResumo) mais, agora, as ações de
// verdade — editar/resolver conferência, entrada, saída, descartar e
// histórico. Antes eram 4 botões que só mostravam "chega em outra tarefa";
// agora chamam a API de verdade e a lista se atualiza sozinha ao terminar.
export function LoteCard({ lote, onAtualizado }: { lote: EstoqueLote; onAtualizado: () => void }) {
  const { theme } = useTheme();
  const [modo, setModo] = useState<Modo>("ver");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function fechar() {
    setModo("ver");
    setErro(null);
  }

  const botaoAcao: React.CSSProperties = {
    padding: "6px 11px",
    fontSize: 12,
    fontWeight: 500,
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
      aria-label={`Detalhe de ${lote.nome}`}
      style={{
        ...glassSurface(theme, { strong: true, radius: theme.radius.md }),
        padding: "15px 17px",
        margin: "6px 0",
      }}
    >
      <LoteResumo lote={lote} />

      {modo === "ver" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" style={botaoAcao} onClick={() => setModo("editar")}>
            ✎ Editar
          </button>
          <button type="button" style={botaoAcao} onClick={() => setModo("entrada")}>
            + Entrada
          </button>
          <button type="button" style={botaoAcao} onClick={() => setModo("saida")}>
            − Saída
          </button>
          <button type="button" style={botaoAcao} onClick={() => setModo("historico")}>
            Histórico
          </button>
          {lote.quantidade > 0 && (
            <button
              type="button"
              style={{ ...botaoAcao, color: theme.colors.danger, borderColor: theme.colors.danger, marginLeft: "auto" }}
              onClick={() => setModo("descartar")}
            >
              Descartar tudo
            </button>
          )}
        </div>
      )}

      {modo === "editar" && (
        <FormEditar
          lote={lote}
          salvando={salvando}
          erro={erro}
          onCancelar={fechar}
          onSalvar={async (dados) => {
            setSalvando(true);
            setErro(null);
            try {
              await patchEstoqueLote(lote.id, dados);
              fechar();
              onAtualizado();
            } catch (e) {
              setErro(e instanceof Error ? e.message : "Falha ao salvar.");
            } finally {
              setSalvando(false);
            }
          }}
        />
      )}

      {(modo === "entrada" || modo === "saida") && (
        <FormMovimento
          tipo={modo}
          unidade={lote.unidade}
          quantidadeAtual={lote.quantidade}
          salvando={salvando}
          erro={erro}
          onCancelar={fechar}
          onConfirmar={async (quantidade, motivo) => {
            setSalvando(true);
            setErro(null);
            try {
              await movimentarEstoqueLote(lote.id, modo, quantidade, motivo || undefined);
              fechar();
              onAtualizado();
            } catch (e) {
              setErro(e instanceof Error ? e.message : "Falha ao registrar.");
            } finally {
              setSalvando(false);
            }
          }}
        />
      )}

      {modo === "descartar" && (
        <FormDescartar
          quantidade={lote.quantidade}
          unidade={lote.unidade}
          salvando={salvando}
          erro={erro}
          onCancelar={fechar}
          onConfirmar={async (motivo) => {
            setSalvando(true);
            setErro(null);
            try {
              await descartarEstoqueLote(lote.id, motivo);
              fechar();
              onAtualizado();
            } catch (e) {
              setErro(e instanceof Error ? e.message : "Falha ao descartar.");
            } finally {
              setSalvando(false);
            }
          }}
        />
      )}

      {modo === "historico" && <PainelHistorico loteId={lote.id} onFechar={fechar} />}
    </div>
  );
}

function campoEstilo(theme: ReturnType<typeof useTheme>["theme"]): React.CSSProperties {
  return {
    width: "100%",
    padding: "7px 9px",
    fontSize: 12.5,
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.glass.borderSoft}`,
    background: theme.glass.surface,
    color: theme.colors.textPrimary,
    font: "inherit",
  };
}

function FormEditar({
  lote,
  salvando,
  erro,
  onSalvar,
  onCancelar,
}: {
  lote: EstoqueLote;
  salvando: boolean;
  erro: string | null;
  onSalvar: (dados: {
    localId?: string | null;
    validade?: string | null;
    semValidadeImpressa?: boolean;
    quantidade?: number;
    observacoes?: string | null;
  }) => void;
  onCancelar: () => void;
}) {
  const { theme } = useTheme();
  const [locais, setLocais] = useState<EstoqueLocal[] | null>(null);
  const [localId, setLocalId] = useState(lote.localId ?? "");
  const [validade, setValidade] = useState(lote.validade ?? "");
  const [quantidade, setQuantidade] = useState(String(lote.quantidade));
  const [observacoes, setObservacoes] = useState(lote.observacoes ?? "");

  useEffect(() => {
    getEstoqueLocais().then((r) => setLocais(r.locais));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontSize: 11.5, color: theme.colors.textSecondary }}>
        Local
        <select
          value={localId}
          onChange={(e) => setLocalId(e.target.value)}
          style={{ ...campoEstilo(theme), marginTop: 3 }}
        >
          <option value="">— sem local —</option>
          {(locais ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome}
            </option>
          ))}
        </select>
      </label>
      <label style={{ fontSize: 11.5, color: theme.colors.textSecondary }}>
        Validade (impressa no rótulo)
        <input
          type="date"
          value={validade}
          onChange={(e) => setValidade(e.target.value)}
          style={{ ...campoEstilo(theme), marginTop: 3 }}
        />
      </label>
      <label style={{ fontSize: 11.5, color: theme.colors.textSecondary }}>
        Em estoque
        <input
          type="number"
          min={0}
          step="any"
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          style={{ ...campoEstilo(theme), marginTop: 3 }}
        />
      </label>
      <label style={{ fontSize: 11.5, color: theme.colors.textSecondary }}>
        Observações
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={2}
          style={{ ...campoEstilo(theme), marginTop: 3, resize: "vertical", fontFamily: "inherit" }}
        />
      </label>
      {erro && <p style={{ color: theme.colors.danger, fontSize: 12, margin: 0 }}>{erro}</p>}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button type="button" disabled={salvando} onClick={onCancelar} style={{ ...botaoSecundario(theme) }}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={() =>
            onSalvar({
              localId: localId || null,
              validade: validade || null,
              quantidade: quantidade === "" ? undefined : Number(quantidade),
              observacoes: observacoes || null,
            })
          }
          style={{ ...botaoPrimario(theme) }}
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}

function FormMovimento({
  tipo,
  unidade,
  quantidadeAtual,
  salvando,
  erro,
  onConfirmar,
  onCancelar,
}: {
  tipo: "entrada" | "saida";
  unidade: string;
  quantidadeAtual: number;
  salvando: boolean;
  erro: string | null;
  onConfirmar: (quantidade: number, motivo: string) => void;
  onCancelar: () => void;
}) {
  const { theme } = useTheme();
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const n = Number(quantidade);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 12, color: theme.colors.textSecondary }}>
        {tipo === "entrada" ? "Entrada de material" : "Saída de material"} — saldo atual: {quantidadeAtual} {unidade}
      </p>
      <label style={{ fontSize: 11.5, color: theme.colors.textSecondary }}>
        Quantidade ({unidade})
        <input
          type="number"
          min={0}
          step="any"
          autoFocus
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          style={{ ...campoEstilo(theme), marginTop: 3 }}
        />
      </label>
      <label style={{ fontSize: 11.5, color: theme.colors.textSecondary }}>
        Motivo (opcional)
        <input
          type="text"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          style={{ ...campoEstilo(theme), marginTop: 3 }}
        />
      </label>
      {erro && <p style={{ color: theme.colors.danger, fontSize: 12, margin: 0 }}>{erro}</p>}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button type="button" disabled={salvando} onClick={onCancelar} style={botaoSecundario(theme)}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={salvando || !(n > 0)}
          onClick={() => onConfirmar(n, motivo)}
          style={botaoPrimario(theme)}
        >
          {salvando ? "Confirmando…" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}

function FormDescartar({
  quantidade,
  unidade,
  salvando,
  erro,
  onConfirmar,
  onCancelar,
}: {
  quantidade: number;
  unidade: string;
  salvando: boolean;
  erro: string | null;
  onConfirmar: (motivo: MotivoDescarte) => void;
  onCancelar: () => void;
}) {
  const { theme } = useTheme();
  const [motivo, setMotivo] = useState<MotivoDescarte | "">("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 12, color: theme.colors.danger, lineHeight: 1.5 }}>
        Zera o lote inteiro ({quantidade} {unidade}). O registro fica no histórico — nada é apagado, o produto entra
        na lista de compras.
      </p>
      <label style={{ fontSize: 11.5, color: theme.colors.textSecondary }}>
        Motivo
        <select
          value={motivo}
          onChange={(e) => setMotivo(e.target.value as MotivoDescarte)}
          style={{ ...campoEstilo(theme), marginTop: 3 }}
        >
          <option value="">Selecione…</option>
          {MOTIVOS_DESCARTE.map((m) => (
            <option key={m} value={m}>
              {ROTULO_MOTIVO[m]}
            </option>
          ))}
        </select>
      </label>
      {erro && <p style={{ color: theme.colors.danger, fontSize: 12, margin: 0 }}>{erro}</p>}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button type="button" disabled={salvando} onClick={onCancelar} style={botaoSecundario(theme)}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={salvando || !motivo}
          onClick={() => motivo && onConfirmar(motivo)}
          style={{ ...botaoPrimario(theme), background: theme.colors.danger, borderColor: theme.colors.danger }}
        >
          {salvando ? "Descartando…" : "Descartar"}
        </button>
      </div>
    </div>
  );
}

function PainelHistorico({ loteId, onFechar }: { loteId: string; onFechar: () => void }) {
  const { theme } = useTheme();
  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState<
    { data: string; texto: string; cor?: string }[]
  >([]);

  useEffect(() => {
    getEstoqueLoteHistorico(loteId).then((h) => {
      const movs = h.movimentos.map((m) => ({
        data: m.criadoEm,
        texto: `${m.tipo}: ${m.quantidade} ${m.motivo ? `(${m.motivo}) ` : ""}— saldo ${m.saldoAntes} → ${m.saldoDepois}`,
        cor: m.tipo === "descarte" ? theme.colors.danger : m.tipo === "entrada" ? theme.colors.success : undefined,
      }));
      const auds = h.auditoria.map((a) => ({ data: a.criadoEm, texto: a.descricao }));
      setItens([...movs, ...auds].sort((a, b) => (a.data < b.data ? 1 : -1)));
      setCarregando(false);
    });
  }, [loteId, theme]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {carregando && <p style={{ fontSize: 12, color: theme.colors.textSecondary, margin: 0 }}>Carregando…</p>}
      {!carregando && itens.length === 0 && (
        <p style={{ fontSize: 12, color: theme.colors.textSecondary, margin: 0 }}>Nenhum movimento ou edição ainda.</p>
      )}
      {itens.map((it, i) => (
        <div key={i} style={{ fontSize: 12, color: it.cor ?? theme.colors.textPrimary, lineHeight: 1.4 }}>
          <span style={{ color: theme.colors.textSecondary, fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
            {new Date(it.data).toLocaleString("pt-BR")}
          </span>
          {" — "}
          {it.texto}
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" onClick={onFechar} style={botaoSecundario(theme)}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function botaoPrimario(theme: ReturnType<typeof useTheme>["theme"]): React.CSSProperties {
  return {
    padding: "7px 14px",
    fontSize: 12.5,
    fontWeight: 600,
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.colors.primary}`,
    background: theme.colors.primary,
    color: "#fff",
    cursor: "pointer",
    font: "inherit",
  };
}

function botaoSecundario(theme: ReturnType<typeof useTheme>["theme"]): React.CSSProperties {
  return {
    padding: "7px 14px",
    fontSize: 12.5,
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.glass.borderSoft}`,
    background: "transparent",
    color: theme.colors.textPrimary,
    cursor: "pointer",
    font: "inherit",
  };
}
