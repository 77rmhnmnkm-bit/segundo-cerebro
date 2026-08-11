import ExcelJS from "exceljs";

export type LinhaPlanilha = {
  categoria: string;
  nome: string;
  marca: string;
  lote: string;
  situacao: string;
  local: string;
  quantidade: number | null;
  unidade: string;
  validade: Date | null;
  eliminado: boolean;
  origem: string;
  observacoes: string;
};

// A coluna "Unidade" da planilha mistura contagem e embalagem numa string só:
// "13", "4cx", "20pc - 2000u", "0cx". O número da frente é a contagem; o resto
// é a descrição da embalagem. Célula vazia é falta de informação, NÃO zero —
// os dois casos existem na planilha e significam coisas diferentes.
export function parseQuantidade(bruto: string): { valor: number | null; unidade: string } {
  const s = (bruto ?? "").trim();
  if (!s) return { valor: null, unidade: "un." };
  const m = s.match(/^(\d+)\s*(.*)$/);
  if (!m) return { valor: null, unidade: "un." };
  const resto = m[2].trim();
  return { valor: Number(m[1]), unidade: resto || "un." };
}

// Excel conta dias desde 30/12/1899. Construímos a data com componentes locais
// para não cair no bug de fuso: new Date(serial * 86400000) daria o dia anterior
// em UTC-3.
const EPOCH_EXCEL = Date.UTC(1899, 11, 30);

export function parseValidadeSerial(bruto: string | number | Date | null): Date | null {
  if (bruto === null || bruto === undefined || bruto === "") return null;
  if (bruto instanceof Date) {
    // ExcelJS já devolve as células de data como Date ancorado em meia-noite
    // UTC (conferido nas 358 células de Validade da planilha real: todas com
    // getUTCHours/Minutes/Seconds === 0). Ler com getFullYear/getMonth/getDate
    // (locais) joga a data um dia para trás em UTC-3 — exatamente o bug de
    // fuso que este módulo existe para evitar, só que escondido neste ramo em
    // vez do ramo numérico. Por isso lemos os componentes em UTC aqui.
    return new Date(bruto.getUTCFullYear(), bruto.getUTCMonth(), bruto.getUTCDate());
  }
  const n = Number(bruto);
  if (!Number.isFinite(n)) return null;
  const utc = new Date(EPOCH_EXCEL + n * 86_400_000);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

const COLUNAS = {
  categoria: 1, nome: 2, marca: 3, lote: 4, situacao: 5, local: 6,
  unidade: 7, validade: 8, eliminado: 16, origem: 17,
} as const;

const texto = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text).trim();
  return String(v).trim();
};

// A coluna "Eliminados" é uma fórmula (=TRUE()/=FALSE()), não um "1"/"0"
// literal: o ExcelJS devolve { formula: "TRUE()", result: true } ou
// { formula: "FALSE()" } (sem "result" quando o cache do Excel não grava o
// caso falso). texto(...) === "1" nunca bate contra isso — na planilha real
// dá 0 eliminados em vez dos 47 esperados. Por isso extraímos o resultado da
// fórmula em vez de comparar a célula como texto.
const ehVerdadeiro = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (v !== null && typeof v === "object" && "result" in v) {
    return ehVerdadeiro((v as { result: unknown }).result);
  }
  const t = texto(v).toLowerCase();
  return t === "1" || t === "true" || t === "verdadeiro";
};

export async function lerPlanilha(caminho: string): Promise<LinhaPlanilha[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);
  const ws = wb.getWorksheet("ESTOQUE COMPLETO");
  if (!ws) throw new Error('A aba "ESTOQUE COMPLETO" não existe nesse arquivo.');

  const linhas: LinhaPlanilha[] = [];
  ws.eachRow((row, numero) => {
    if (numero === 1) return; // cabeçalho
    const nome = texto(row.getCell(COLUNAS.nome).value);
    if (!nome) return;
    const q = parseQuantidade(texto(row.getCell(COLUNAS.unidade).value));
    linhas.push({
      categoria: texto(row.getCell(COLUNAS.categoria).value),
      nome,
      marca: texto(row.getCell(COLUNAS.marca).value),
      lote: texto(row.getCell(COLUNAS.lote).value),
      situacao: texto(row.getCell(COLUNAS.situacao).value).toLowerCase(),
      local: texto(row.getCell(COLUNAS.local).value),
      quantidade: q.valor,
      unidade: q.unidade,
      validade: parseValidadeSerial(row.getCell(COLUNAS.validade).value as string | number | Date | null),
      eliminado: ehVerdadeiro(row.getCell(COLUNAS.eliminado).value),
      origem: texto(row.getCell(COLUNAS.origem).value),
      observacoes: "",
    });
  });
  return linhas;
}
