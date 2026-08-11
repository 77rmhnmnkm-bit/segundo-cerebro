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
};
