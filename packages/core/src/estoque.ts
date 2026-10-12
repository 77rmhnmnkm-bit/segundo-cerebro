export type StatusLote = "vencido" | "prazo_passou" | "armadilha" | "no_prazo" | "sem_validade";

export type EstoqueVisao = "estoque" | "validade" | "comprar";

export type EstoqueLote = {
  id: string;
  produtoId: string;
  nome: string;
  marca: string | null;
  especialidade: string;
  lote: string | null;
  validade: string | null;
  usarAte: string | null;
  usarAteMotivo: string | null;
  local: string | null;
  localId: string | null;
  quantidade: number;
  unidade: string;
  situacao: string | null;
  ativo: boolean;
  precisaConferencia: boolean;
  conferenciaMotivo: string[];
  observacoes: string | null;
  status: StatusLote;
  diasPerdidos: number;
};

export type MotivoDescarte = "vencido" | "danificado" | "contaminado" | "perdido" | "devolvido";
export const MOTIVOS_DESCARTE: MotivoDescarte[] = ["vencido", "danificado", "contaminado", "perdido", "devolvido"];

export type EstoqueLocal = {
  id: string;
  nome: string;
  nivel: "sala" | "movel" | "caixa";
  paiId: string | null;
};

export type EstoqueMovimento = {
  id: string;
  tipo: "entrada" | "saida" | "descarte" | "contagem" | "transferencia";
  quantidade: number;
  saldoAntes: number;
  saldoDepois: number;
  motivo: string | null;
  usuario: string;
  criadoEm: string;
};

export type EstoqueAuditoria = {
  id: string;
  acao: string;
  campo: string | null;
  valorAntes: string | null;
  valorDepois: string | null;
  descricao: string;
  usuario: string;
  criadoEm: string;
};

export type EstoqueHistorico = {
  movimentos: EstoqueMovimento[];
  auditoria: EstoqueAuditoria[];
};

export type EstoqueProduto = {
  id: string;
  nome: string;
  marca: string | null;
  especialidade: string;
  lotes: number;
  saldo: number;
};

export type EstoqueContagens = {
  estoque: number;
  validade: number;
  comprar: number;
  conferencia: number;
  // Subconjunto de "estoque": lotes com validade impressa já vencida que
  // ainda têm saldo físico > 0 (alimenta o painel do revisor — nunca é
  // inventado no cliente, sempre calculado no servidor a partir de dados reais).
  vencidosComEstoque: number;
};

export type EstoqueFiltros = {
  especialidades: Array<{ nome: string; total: number }>;
  locais: Array<{ id: string; nome: string; total: number }>;
};
