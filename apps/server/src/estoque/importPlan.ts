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
  eliminado: boolean;
  precisaConferencia: boolean;
  conferenciaMotivo: string[];
  origem: string;
  observacoes: string;
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

// Preenchimento de planilha, não identificador de lote: repetir "NC" ou "—"
// em várias linhas não quer dizer que é o mesmo lote físico.
const LOTE_SEM_IDENTIDADE = new Set(["", "NC", "—"]);

export function planImport(linhas: LinhaPlanilha[], hoje: Date): PlanoImportacao {
  const produtos = new Map<string, ProdutoPlanejado>();
  const lotes: LotePlanejado[] = [];
  const locais = new Set<string>();

  // Pré-passada: o laço principal abaixo nunca compara uma linha com outra,
  // então dois lotes com o mesmo número e validades diferentes entravam sem
  // marcação nenhuma — caso real: tricresolformalina lote 51224 com validade
  // 2026-06-01 numa linha e 2027-06-01 noutra, a unidade viva gravada como
  // válida até 2027. Agrupamos por (chaveProduto, lote) — o mesmo par que o
  // laço principal usa para identidade de produto — e marcamos o grupo todo
  // quando as validades divergem ou quando duas linhas do grupo são cópia
  // exata uma da outra. Isto NUNCA funde lote, NUNCA altera validade e NUNCA
  // remove linha: só acrescenta motivo de conferência.
  const grupos = new Map<string, LinhaPlanilha[]>();
  for (const l of linhas) {
    const loteTrim = (l.lote ?? "").trim();
    if (LOTE_SEM_IDENTIDADE.has(loteTrim)) continue;
    const chaveGrupo = `${norm(l.nome)}|${norm(l.marca)}|${loteTrim}`;
    const grupo = grupos.get(chaveGrupo) ?? [];
    grupo.push(l);
    grupos.set(chaveGrupo, grupo);
  }

  // Motivos extras por linha, calculados na pré-passada e aplicados no laço
  // principal. A chave é a própria referência da linha (cada elemento de
  // `linhas` é um objeto distinto), o que funciona mesmo quando duas linhas
  // são estruturalmente idênticas — é exatamente o caso de "linha
  // possivelmente duplicada".
  const motivosExtras = new Map<LinhaPlanilha, Set<string>>();
  const acrescentarMotivoExtra = (l: LinhaPlanilha, motivo: string): void => {
    const s = motivosExtras.get(l) ?? new Set<string>();
    s.add(motivo);
    motivosExtras.set(l, s);
  };

  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;

    const validadesDoGrupo = new Set(grupo.map((l) => (l.validade ? l.validade.getTime() : null)));
    if (validadesDoGrupo.size > 1) {
      for (const l of grupo) acrescentarMotivoExtra(l, "mesmo lote com validades diferentes");
    }

    for (let i = 0; i < grupo.length; i++) {
      for (let j = i + 1; j < grupo.length; j++) {
        const a = grupo[i];
        const b = grupo[j];
        const mesmaValidade = (a.validade ? a.validade.getTime() : null) === (b.validade ? b.validade.getTime() : null);
        if (mesmaValidade && a.local === b.local && a.situacao === b.situacao && a.quantidade === b.quantidade) {
          acrescentarMotivoExtra(a, "linha possivelmente duplicada");
          acrescentarMotivoExtra(b, "linha possivelmente duplicada");
        }
      }
    }
  }

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
    for (const motivo of motivosExtras.get(l) ?? []) motivos.push(motivo);

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
      eliminado: l.eliminado,
      precisaConferencia: motivos.length > 0,
      conferenciaMotivo: motivos,
      origem: l.origem || "manual",
      observacoes: l.observacoes,
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
