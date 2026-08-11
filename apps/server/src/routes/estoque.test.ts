import { describe, it, expect } from "vitest";
import { montarFiltroVisao, ordemDaVisao, status, dataLocal } from "./estoque.js";

describe("montarFiltroVisao", () => {
  it("estoque mostra só o que existe fisicamente", () => {
    expect(montarFiltroVisao("estoque")).toBe("l.ativo");
  });

  it("validade pega vencido e armadilha, só do que tem saldo", () => {
    const f = montarFiltroVisao("validade");
    expect(f).toContain("l.ativo");
    expect(f).toContain("l.usar_ate");
  });

  it("nunca usa quantidade > 0 sozinho — ignoraria eliminado_na_origem", () => {
    for (const v of ["estoque", "validade"] as const) {
      expect(montarFiltroVisao(v)).not.toMatch(/quantidade\s*>\s*0/);
    }
  });
});

describe("ordemDaVisao", () => {
  it("ordena por usar_ate, não por validade", () => {
    expect(ordemDaVisao("validade")).toContain("usar_ate");
    expect(ordemDaVisao("validade")).not.toContain("l.validade");
  });

  it("nulos vão para o fim", () => {
    expect(ordemDaVisao("estoque")).toContain("nulls last");
  });
});

describe("status — regressão: Date do pg contra string", () => {
  it("lote vencido (Date passado como objeto) é reportado como vencido", () => {
    const row = {
      validade: new Date(2026, 6, 1), // 1º de julho (mês 6 em JS)
      usar_ate: null,
    };
    const resultado = status(row, "2026-08-10");
    expect(resultado).toBe("vencido");
  });

  it("lote com prazo passado é reportado como prazo_passou", () => {
    const row = {
      validade: new Date(2026, 8, 1), // 1º de setembro
      usar_ate: new Date(2026, 7, 1), // 1º de agosto (passado)
    };
    const resultado = status(row, "2026-08-10");
    expect(resultado).toBe("prazo_passou");
  });

  it("lote com armadilha (usar_ate < validade, ambos futuros)", () => {
    const row = {
      validade: new Date(2026, 10, 1), // 1º de novembro
      usar_ate: new Date(2026, 8, 15), // 15 de setembro
    };
    const resultado = status(row, "2026-08-10");
    expect(resultado).toBe("armadilha");
  });

  it("lote com usar_ate igual a validade é reportado como no_prazo", () => {
    const row = {
      validade: new Date(2026, 9, 1), // 1º de outubro
      usar_ate: new Date(2026, 9, 1), // mesmo dia
    };
    const resultado = status(row, "2026-08-10");
    expect(resultado).toBe("no_prazo");
  });

  it("lote sem validade é reportado como sem_validade", () => {
    const row = {
      validade: null,
      usar_ate: new Date(2026, 9, 1),
    };
    const resultado = status(row, "2026-08-10");
    expect(resultado).toBe("sem_validade");
  });
});

describe("dataLocal", () => {
  it("converte objeto Date para string YYYY-MM-DD", () => {
    const d = new Date(2026, 7, 15); // 15 de agosto (mês 7 em JS)
    expect(dataLocal(d)).toBe("2026-08-15");
  });

  it("string já no formato passa intacta", () => {
    expect(dataLocal("2026-08-15")).toBe("2026-08-15");
  });

  it("null devolve null", () => {
    expect(dataLocal(null)).toBe(null);
    expect(dataLocal(undefined)).toBe(null);
  });

  it("Date às 22h local não recua um dia", () => {
    // Cria um Date às 22h local (não usa toISOString que recuaria em UTC-3)
    const dt = new Date(2026, 7, 15, 22, 0, 0); // 15 de agosto às 22h
    const resultado = dataLocal(dt);
    expect(resultado).toBe("2026-08-15"); // não recua para 14
  });
});
