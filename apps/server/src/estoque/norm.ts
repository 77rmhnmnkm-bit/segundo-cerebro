// Cópia local de packages/core/norm.ts.
// NÃO importar de @app/core: o pacote resolve como CommonJS sob tsx/node-ESM e
// importar um valor em runtime derruba o servidor com "does not provide an
// export named". Só `import type` funciona de lá.
// O teste de contrato em norm.test.ts falha se esta cópia divergir do core.
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
