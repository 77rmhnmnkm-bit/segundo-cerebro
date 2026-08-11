import { describe, it, expect } from "vitest";
import { planImport } from "./importPlan.js";
import type { LinhaPlanilha } from "./planilha.js";

const HOJE = new Date(2026, 7, 10);

const linha = (over: Partial<LinhaPlanilha> = {}): LinhaPlanilha => ({
  categoria: "Material De Endodontia",
  nome: "Gutapercha Ponta",
  marca: "Dentsply Sirona",
  lote: "384480",
  situacao: "fechado",
  local: "Prateleira IV - Caixa Endodontia",
  quantidade: 3,
  unidade: "un.",
  validade: new Date(2027, 5, 1),
  eliminado: false,
  origem: "LEVANTAMENTO",
  observacoes: "",
  ...over,
});

describe("planImport — especialidades", () => {
  it("junta as grafias de dentística num só nome", () => {
    const p = planImport(
      [
        linha({ categoria: "Material De dentística", nome: "A" }),
        linha({ categoria: "Material de denstística ", nome: "B" }),
      ],
      HOJE,
    );
    expect(p.produtos.map((x) => x.especialidade)).toEqual(["Dentística", "Dentística"]);
  });

  it("junta as grafias de endodontia", () => {
    const p = planImport(
      [
        linha({ categoria: "Material De Endodontia", nome: "A" }),
        linha({ categoria: "Material De endodontia", nome: "B" }),
      ],
      HOJE,
    );
    expect(new Set(p.produtos.map((x) => x.especialidade))).toEqual(new Set(["Endodontia"]));
  });
});

describe("planImport — fusão de produtos", () => {
  it("funde grafias que só diferem em caixa e acento", () => {
    const p = planImport(
      [
        linha({ nome: "Ácido fosfórico 37%", marca: "SSWHITE", lote: "1" }),
        linha({ nome: "Acido fosforico 37%", marca: "SSWHITE", lote: "2" }),
      ],
      HOJE,
    );
    expect(p.produtos).toHaveLength(1);
    expect(p.lotes).toHaveLength(2);
    expect(p.resumo.fusoes).toHaveLength(1);
  });

  it("funde marcas que só diferem em caixa", () => {
    const p = planImport(
      [
        linha({ nome: "Maxxion", marca: "FMG", lote: "1" }),
        linha({ nome: "Maxxion", marca: "Fmg", lote: "2" }),
      ],
      HOJE,
    );
    expect(p.produtos).toHaveLength(1);
  });

  it("NUNCA funde produtos que diferem no sufixo de cor", () => {
    const p = planImport(
      [
        linha({ nome: "Resina LISS - EA1", marca: "FGM", lote: "1" }),
        linha({ nome: "Resina LISS - EA2", marca: "FGM", lote: "2" }),
      ],
      HOJE,
    );
    expect(p.produtos).toHaveLength(2);
    expect(p.resumo.fusoes).toHaveLength(0);
  });

  it("NUNCA funde limas de calibres diferentes", () => {
    const p = planImport(
      [
        linha({ nome: "Protaper Universal - F2", lote: "1" }),
        linha({ nome: "Protaper Universal - F4", lote: "2" }),
      ],
      HOJE,
    );
    expect(p.produtos).toHaveLength(2);
  });
});

describe("planImport — ativo contra inativo", () => {
  it("saldo positivo e não eliminado fica ativo", () => {
    expect(planImport([linha({ quantidade: 3 })], HOJE).lotes[0].ativo).toBe(true);
  });

  it("saldo zero fica inativo mas é preservado", () => {
    const p = planImport([linha({ quantidade: 0 })], HOJE);
    expect(p.lotes).toHaveLength(1);
    expect(p.lotes[0].ativo).toBe(false);
  });

  it("eliminado fica inativo mas é preservado", () => {
    const p = planImport([linha({ quantidade: 5, eliminado: true })], HOJE);
    expect(p.lotes).toHaveLength(1);
    expect(p.lotes[0].ativo).toBe(false);
  });
});

describe("planImport — flag eliminado", () => {
  it("linha marcada como eliminada gera lote com eliminado=true e ativo=false", () => {
    const l = planImport([linha({ quantidade: 5, eliminado: true })], HOJE).lotes[0];
    expect(l.eliminado).toBe(true);
    expect(l.ativo).toBe(false);
  });

  it("linha não eliminada gera lote com eliminado=false", () => {
    const l = planImport([linha({ quantidade: 5, eliminado: false })], HOJE).lotes[0];
    expect(l.eliminado).toBe(false);
  });

  it("lote eliminado continua preservado na lista do plano", () => {
    const p = planImport([linha({ quantidade: 5, eliminado: true })], HOJE);
    expect(p.lotes).toHaveLength(1);
    expect(p.lotes[0].eliminado).toBe(true);
  });
});

describe("planImport — marcação de conferência", () => {
  it("marca sem local", () => {
    const l = planImport([linha({ local: "" })], HOJE).lotes[0];
    expect(l.precisaConferencia).toBe(true);
    expect(l.conferenciaMotivo).toContain("sem local");
  });

  it("marca sem quantidade", () => {
    const l = planImport([linha({ quantidade: null })], HOJE).lotes[0];
    expect(l.conferenciaMotivo).toContain("sem quantidade");
  });

  it("marca validade implausível SEM alterá-la", () => {
    const l = planImport([linha({ validade: new Date(2050, 0, 1) })], HOJE).lotes[0];
    expect(l.conferenciaMotivo).toContain("validade implausível");
    expect(l.validade?.getFullYear()).toBe(2050);
  });

  it("marca sem validade quando há saldo", () => {
    const l = planImport([linha({ validade: null, quantidade: 4 })], HOJE).lotes[0];
    expect(l.conferenciaMotivo).toContain("sem validade");
  });

  it("acumula vários motivos na mesma linha", () => {
    const l = planImport([linha({ local: "", validade: null, quantidade: 4 })], HOJE).lotes[0];
    expect(l.conferenciaMotivo).toHaveLength(2);
  });
});

describe("planImport — prazo real", () => {
  it("calcula usarAte recuando para antes do recesso", () => {
    const l = planImport([linha({ validade: new Date(2026, 11, 22) })], HOJE).lotes[0];
    expect(l.usarAte?.getMonth()).toBe(10);
    expect(l.usarAte?.getDate()).toBe(30);
    expect(l.usarAteMotivo).toBe("recesso_fim_ano");
  });

  it("não recua quando a validade cai em período letivo", () => {
    const l = planImport([linha({ validade: new Date(2027, 5, 1) })], HOJE).lotes[0];
    expect(l.usarAteMotivo).toBe("validade");
  });

  it("lote sem validade não tem prazo real", () => {
    const l = planImport([linha({ validade: null })], HOJE).lotes[0];
    expect(l.usarAte).toBeNull();
  });
});

describe("planImport — especialidades divergentes", () => {
  it("mesmo produto em categorias diferentes gera uma entrada só, com as duas especialidades", () => {
    const p = planImport(
      [
        linha({ categoria: "Material De Endodontia", nome: "IRM", marca: "Dentsply", lote: "1" }),
        linha({ categoria: "Material De  prótese", nome: "IRM", marca: "Dentsply", lote: "2" }),
      ],
      HOJE,
    );
    expect(p.produtos).toHaveLength(1);
    expect(p.produtos[0].especialidades).toEqual(["Endodontia", "Prótese"]);
    expect(p.resumo.especialidadesDivergentes).toEqual([
      { produto: "IRM / Dentsply", especialidades: ["Endodontia", "Prótese"] },
    ]);
  });

  it("mesma categoria em ambas as linhas não gera divergência", () => {
    const p = planImport(
      [
        linha({ categoria: "Material De Endodontia", nome: "IRM", marca: "Dentsply", lote: "1" }),
        linha({ categoria: "Material De endodontia", nome: "IRM", marca: "Dentsply", lote: "2" }),
      ],
      HOJE,
    );
    expect(p.produtos).toHaveLength(1);
    expect(p.produtos[0].especialidades).toEqual(["Endodontia"]);
    expect(p.resumo.especialidadesDivergentes).toEqual([]);
  });

  it("especialidade (singular) continua sendo a primeira categoria vista", () => {
    const p = planImport(
      [
        linha({ categoria: "Material De Endodontia", nome: "IRM", marca: "Dentsply", lote: "1" }),
        linha({ categoria: "Material De  prótese", nome: "IRM", marca: "Dentsply", lote: "2" }),
      ],
      HOJE,
    );
    expect(p.produtos[0].especialidade).toBe("Endodontia");
  });
});

describe("planImport — mesmo lote comparado entre linhas", () => {
  it("duas linhas com mesmo produto e lote mas validades diferentes recebem o motivo nas duas", () => {
    const p = planImport(
      [
        linha({ lote: "51224", validade: new Date(2026, 5, 1) }),
        linha({ lote: "51224", validade: new Date(2027, 5, 1) }),
      ],
      HOJE,
    );
    expect(p.lotes[0].conferenciaMotivo).toContain("mesmo lote com validades diferentes");
    expect(p.lotes[1].conferenciaMotivo).toContain("mesmo lote com validades diferentes");
    expect(p.lotes[0].precisaConferencia).toBe(true);
    expect(p.lotes[1].precisaConferencia).toBe(true);
    // Restrição inviolável: a validade de cada linha não é tocada.
    expect(p.lotes[0].validade).toEqual(new Date(2026, 5, 1));
    expect(p.lotes[1].validade).toEqual(new Date(2027, 5, 1));
  });

  it("duas linhas idênticas (produto, lote, validade, local, situação e quantidade) recebem o motivo de duplicata", () => {
    const p = planImport(
      [linha({ lote: "7407" }), linha({ lote: "7407" })],
      HOJE,
    );
    expect(p.lotes[0].conferenciaMotivo).toContain("linha possivelmente duplicada");
    expect(p.lotes[1].conferenciaMotivo).toContain("linha possivelmente duplicada");
    expect(p.lotes).toHaveLength(2); // nada é removido
  });

  it("duas linhas com mesmo produto mas lotes diferentes não recebem nenhum dos dois motivos", () => {
    const p = planImport(
      [
        linha({ lote: "1", validade: new Date(2026, 5, 1) }),
        linha({ lote: "2", validade: new Date(2027, 5, 1) }),
      ],
      HOJE,
    );
    expect(p.lotes[0].conferenciaMotivo).not.toContain("mesmo lote com validades diferentes");
    expect(p.lotes[0].conferenciaMotivo).not.toContain("linha possivelmente duplicada");
    expect(p.lotes[1].conferenciaMotivo).not.toContain("mesmo lote com validades diferentes");
    expect(p.lotes[1].conferenciaMotivo).not.toContain("linha possivelmente duplicada");
  });

  it('lote "NC" repetido não dispara nenhum motivo — é preenchimento, não identidade', () => {
    const p = planImport(
      [
        linha({ lote: "NC", validade: new Date(2026, 5, 1) }),
        linha({ lote: "NC", validade: new Date(2027, 5, 1) }),
      ],
      HOJE,
    );
    expect(p.lotes[0].conferenciaMotivo).not.toContain("mesmo lote com validades diferentes");
    expect(p.lotes[1].conferenciaMotivo).not.toContain("mesmo lote com validades diferentes");
  });

  it("uma linha isolada (lote sem repetição) continua sem os novos motivos", () => {
    const l = planImport([linha({ lote: "384480" })], HOJE).lotes[0];
    expect(l.conferenciaMotivo).not.toContain("mesmo lote com validades diferentes");
    expect(l.conferenciaMotivo).not.toContain("linha possivelmente duplicada");
    expect(l.precisaConferencia).toBe(false);
  });
});

describe("planImport — observações sanitárias", () => {
  it("propaga o texto da observação da linha para o lote planejado, intacto", () => {
    const l = planImport(
      [linha({ observacoes: "Fabricação 13/11/2025. 20 unidades por caixa." })],
      HOJE,
    ).lotes[0];
    expect(l.observacoes).toBe("Fabricação 13/11/2025. 20 unidades por caixa.");
  });

  it("linha sem observação chega com string vazia, não undefined", () => {
    const l = planImport([linha({ observacoes: "" })], HOJE).lotes[0];
    expect(l.observacoes).toBe("");
  });
});

describe("planImport — resumo", () => {
  it("conta vencidos com saldo separadamente", () => {
    const p = planImport(
      [
        linha({ validade: new Date(2026, 6, 1), quantidade: 5 }),
        linha({ validade: new Date(2026, 6, 1), quantidade: 0, lote: "z" }),
      ],
      HOJE,
    );
    expect(p.resumo.vencidosComSaldo).toBe(1);
  });

  it("nao mistura vencido com prazo morto no recesso", () => {
    // 05/08/2026: rotulo ainda valido, mas o prazo util morreu em 29/07.
    const p = planImport([linha({ validade: new Date(2026, 7, 5), quantidade: 5 })], new Date(2026, 7, 3));
    expect(p.resumo.vencidosComSaldo).toBe(0);
    expect(p.resumo.prazoPassouComSaldo).toBe(1);
  });

  it("coleta os locais distintos", () => {
    const p = planImport(
      [linha({ local: "Sala A" }), linha({ local: "Sala B", lote: "2" }), linha({ local: "Sala A", lote: "3" })],
      HOJE,
    );
    expect(p.locais.sort()).toEqual(["Sala A", "Sala B"]);
  });
});
