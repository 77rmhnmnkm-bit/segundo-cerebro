// Regra ÚNICA de deduplicação de produtos e marcas.
// Pontuação e espaço são REMOVIDOS, não substituídos por espaço: é o que faz
// "SS Plus" e "SSplus" virarem a mesma marca. Qualquer mudança aqui precisa
// ser espelhada em apps/server/src/estoque/norm.ts — o teste de contrato falha
// se as duas divergirem.
// Limitação conhecida: como a pontuação é removida em vez de virar espaço,
// nomes que só diferem por um ponto colidem — "Luvas 7.0" e "Luvas 70" viram
// a mesma chave. Nos 388 registros reais da clínica isso não acontece: as
// únicas colisões observadas são acento, caixa e espaço, todas legítimas. Mas
// é um risco para cadastro futuro de produto cujo tamanho ou calibre seja
// escrito das duas formas (com e sem ponto).
export function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

export const NORM_CASES: ReadonlyArray<[string, string]> = [
  ["Ácido fosfórico 37%", "acidofosforico37"],
  ["FMG", "fmg"],
  ["Fmg", "fmg"],
  ["Rioquímica", "rioquimica"],
  ["SS Plus", "ssplus"],
  ["SSplus", "ssplus"],
  ["tricresol formalina", "tricresolformalina"],
  ["tricresolformalina", "tricresolformalina"],
  ["Resina LISS - EA1", "resinalissea1"],
  ["Resina LISS - EA2", "resinalissea2"],
  ["Ultrapak - fio Retrator - #00", "ultrapakfioretrator00"],
  ["Ultrapak - fio Retrator - #000", "ultrapakfioretrator000"],
  ["", ""],
];
