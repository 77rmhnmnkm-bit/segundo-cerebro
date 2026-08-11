import { describe, it, expect } from "vitest";
import { parseQuantidade, parseValidadeSerial, ehVerdadeiro } from "./planilha.js";

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
    // Construída com Date.UTC porque é assim que o ExcelJS entrega — meia-noite
    // UTC. Usar new Date(2027, 2, 1) aqui passava por acaso em UTC-3 e quebrava
    // em fuso positivo, além de contradizer o contrato da função.
    expect(iso(parseValidadeSerial(new Date(Date.UTC(2027, 2, 1))))).toBe("2027-03-01");
  });

  it("lê Date ancorada em meia-noite UTC (formato real do ExcelJS) sem recuar um dia", () => {
    // Este é o formato exato que o ExcelJS entrega para células de data:
    // Date ancorada em getUTCHours/Minutes/Seconds === 0. Ler isso com
    // getters LOCAIS em UTC-3 devolveria "2023-02-28" — recuando um dia —
    // que foi o bug real encontrado em 358 de 358 linhas de Validade da
    // planilha real (ver Achado Important 1 da revisão). O código lê com
    // getters UTC (getUTCFullYear/getUTCMonth/getUTCDate) exatamente para
    // evitar essa regressão.
    expect(iso(parseValidadeSerial(new Date(Date.UTC(2023, 2, 1))))).toBe("2023-03-01");
  });
});

describe("ehVerdadeiro — formato de fórmula do ExcelJS", () => {
  it('{ formula: "TRUE()", result: true } é verdadeiro', () => {
    expect(ehVerdadeiro({ formula: "TRUE()", result: true })).toBe(true);
  });

  it('{ formula: "FALSE()" } sem "result" é falso (cache do Excel não grava o caso falso)', () => {
    expect(ehVerdadeiro({ formula: "FALSE()" })).toBe(false);
  });

  it('{ formula: "FALSE()", result: false } é falso', () => {
    expect(ehVerdadeiro({ formula: "FALSE()", result: false })).toBe(false);
  });

  it('string "1" ainda é aceita como verdadeiro (fallback de texto)', () => {
    expect(ehVerdadeiro("1")).toBe(true);
  });

  it("null, undefined e string vazia são falsos", () => {
    expect(ehVerdadeiro(null)).toBe(false);
    expect(ehVerdadeiro(undefined)).toBe(false);
    expect(ehVerdadeiro("")).toBe(false);
  });
});
