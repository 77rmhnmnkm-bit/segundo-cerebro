import { describe, it, expect } from "vitest";
import { parseQuantidade, parseValidadeSerial } from "./planilha.js";

const iso = (x: Date | null) =>
  x ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}` : null;

describe("parseQuantidade", () => {
  it("lê número simples", () => {
    expect(parseQuantidade("13")).toEqual({ valor: 13, unidade: "un." });
  });

  it("lê zero como zero, não como ausente", () => {
    expect(parseQuantidade("0")).toEqual({ valor: 0, unidade: "un." });
  });

  it("lê caixas", () => {
    expect(parseQuantidade("4cx")).toEqual({ valor: 4, unidade: "cx" });
  });

  it("lê pacote com total de unidades", () => {
    expect(parseQuantidade("20pc - 2000u")).toEqual({ valor: 20, unidade: "pc - 2000u" });
  });

  it("lê caixa zerada", () => {
    expect(parseQuantidade("0cx")).toEqual({ valor: 0, unidade: "cx" });
  });

  it("célula vazia devolve nulo — é falta de informação, não zero", () => {
    expect(parseQuantidade("")).toEqual({ valor: null, unidade: "un." });
    expect(parseQuantidade("   ")).toEqual({ valor: null, unidade: "un." });
  });
});

describe("parseValidadeSerial", () => {
  it("converte serial do Excel em data local", () => {
    expect(iso(parseValidadeSerial(46023))).toBe("2026-01-01");
  });

  it("preserva validade implausível em vez de descartar", () => {
    expect(iso(parseValidadeSerial(54789))).toBe("2050-01-01");
  });

  it("célula vazia devolve nulo", () => {
    expect(parseValidadeSerial("")).toBeNull();
    expect(parseValidadeSerial(null)).toBeNull();
  });

  it("aceita Date já convertida pelo ExcelJS", () => {
    expect(iso(parseValidadeSerial(new Date(2027, 2, 1) as unknown as number))).toBe("2027-03-01");
  });
});
