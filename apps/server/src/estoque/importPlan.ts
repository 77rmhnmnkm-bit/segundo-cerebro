import { norm } from "./norm.js";
import { usarAte, classificar, CALENDARIO_PADRAO } from "./recesso.js";
import type { LinhaPlanilha } from "./planilha.js";

export type ProdutoPlanejado = {
  nomeNorm: string;
  marcaNorm: string;
  nome: string;
  marca: string;
  especialidade: string;
  // Todas as especialidades vistas para este produto, na ordem em que
  // apareceram, sem repetição. Ver comentário em `especialidadesDivergentes`
  // logo abaixo, em ResumoImportacao, sobre por que isto existe.
  especialidades: string[];
  grafias: string[];
};

export type LotePlanejado = {
  chaveProduto: string;
  lote: string;
  validade: Date | null;
  usarAte: Date | null;
  usarAteMotivo: string | null;
  local: string;
  quantidade: number;
  unidade: string;
  situacao: string | null;
  ativo: boolean;
  precisaConferencia: boolean;
  conferenciaMotivo: string[];
  origem: string;
};

export type ResumoImportacao = {
  linhas: number;
  produtos: number;
  lotes: number;
  ativos: number;
  inativos: number;
  conferencia: number;
  vencidosComSaldo: number;
  prazoPassouComSaldo: number;
  armadilhas: number;
  fusoes: Array<{ de: string[]; para: string }>;
  // Um mesmo material pode ser legitimamente usado em mais de uma disciplina
  // (ex.: IRM em endodontia e em prótese) — linhas com o mesmo nome/marca mas
  // categorias diferentes. O banco guarda uma única especialidade por produto
  // (a primeira vista, em ProdutoPlanejado.especialidade), então a segunda
  // categoria não pode virar uma segunda linha nem sobrescrever a primeira em
  // silêncio. Em vez de descartá-la, ela fica registrada aqui para o
  // relatório de importação mostrar a divergência ao usuário.
  especialidadesDivergentes: Array<{ produto: string; especialidades: string[] }>;
};

export type PlanoImportacao = {
  produtos: ProdutoPlanejado[];
  lotes: LotePlanejado[];
  locais: string[];
  resumo: ResumoImportacao;
};

// As 12 grafias da planilha viram 10 especialidades. "denstística" é typo de
// "dentística" — a única fusão aqui que não é só caixa/acento, e por isso está
// escrita à mão em vez de sair de norm().
export const ESPECIALIDADES: Record<string, string> = {
  materialanestesico: "Anestésico",
  materialdecirurgia: "Cirurgia",
  materialdedentistica: "Dentística",
  materialdedenstistica: "Dentística",
  materialdeendodontia: "Endodontia",
  materialdeesterilizacao: "Esterilização",
  materialdelimpeza: "Limpeza",
  materialdeprevencao: "Prevenção",
  materialdeprotecao: "Proteção",
  materialdeprotese: "Prótese",
  materialdeusogeral: "Uso geral",
};

const ANO_IMPLAUSIVEL = 2035;

export function planImport(linhas: LinhaPlanilha[], hoje: Date): PlanoImportacao {
  const produtos = new Map<string, ProdutoPlanejado>();
  const lotes: LotePlanejado[] = [];
  const locais = new Set<string>();

  for (const l of linhas) {
    const nomeNorm = norm(l.nome);
    const marcaNorm = norm(l.marca);
    const chave = `${nomeNorm}|${marcaNorm}`;

    const especialidadeLinha = ESPECIALIDADES[norm(l.categoria)] ?? "Uso geral";

    if (!produtos.has(chave)) {
      produtos.set(chave, {
        nomeNorm,
        marcaNorm,
        nome: l.nome,
        marca: l.marca,
        especialidade: especialidadeLinha,
        especialidades: [especialidadeLinha],
        grafias: [],
      });
    }
    const p = produtos.get(chave)!;
    if (!p.especialidades.includes(especialidadeLinha)) p.especialidades.push(especialidadeLinha);
    const grafia = `${l.nome} / ${l.marca}`;
    if (!p.grafias.includes(grafia)) p.grafias.push(grafia);

    if (l.local) locais.add(l.local);

    const motivos: string[] = [];
    if (!l.local) motivos.push("sem local");
    if (l.quantidade === null) motivos.push("sem quantidade");
    if (l.validade && l.validade.getFullYear() > ANO_IMPLAUSIVEL) motivos.push("validade implausível");
    const qtd = l.quantidade ?? 0;
    if (!l.validade && qtd > 0) motivos.push("sem validade");

    const r = l.validade ? usarAte(l.validade, CALENDARIO_PADRAO) : null;

    lotes.push({
      chaveProduto: chave,
      lote: l.lote,
      validade: l.validade,
      usarAte: r ? r.data : null,
      usarAteMotivo: r ? r.motivo : null,
      local: l.local,
      quantidade: qtd,
      unidade: l.unidade,
      situacao: l.situacao === "aberto" || l.situacao === "fechado" ? l.situacao : null,
      ativo: qtd > 0 && !l.eliminado,
      precisaConferencia: motivos.length > 0,
      conferenciaMotivo: motivos,
      origem: l.origem || "manual",
    });
  }

  const fusoes = [...produtos.values()]
    .filter((p) => p.grafias.length > 1)
    .map((p) => ({ de: p.grafias, para: `${p.nome} / ${p.marca}` }));

  const especialidadesDivergentes = [...produtos.values()]
    .filter((p) => p.especialidades.length > 1)
    .map((p) => ({ produto: `${p.nome} / ${p.marca}`, especialidades: p.especialidades }));

  const ativos = lotes.filter((x) => x.ativo);

  return {
    produtos: [...produtos.values()],
    lotes,
    locais: [...locais],
    resumo: {
      linhas: linhas.length,
      produtos: produtos.size,
      lotes: lotes.length,
      ativos: ativos.length,
      inativos: lotes.length - ativos.length,
      conferencia: lotes.filter((x) => x.precisaConferencia).length,
      vencidosComSaldo: ativos.filter(
        (x) => x.validade && classificar(x.validade, hoje) === "vencido",
      ).length,
      prazoPassouComSaldo: ativos.filter(
        (x) => x.validade && classificar(x.validade, hoje) === "prazo_passou",
      ).length,
      armadilhas: ativos.filter(
        (x) => x.validade && classificar(x.validade, hoje) === "armadilha",
      ).length,
      fusoes,
      especialidadesDivergentes,
    },
  };
}
