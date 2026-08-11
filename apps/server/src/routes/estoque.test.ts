import { describe, it, expect } from "vitest";
import { montarFiltroVisao, ordemDaVisao } from "./estoque.js";

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
