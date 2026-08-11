import { describe, it, expect } from "vitest";
import { norm, NORM_CASES } from "./norm.js";
import { norm as normCore, NORM_CASES as CASES_CORE } from "../../../../packages/core/src/norm.js";

describe("norm", () => {
  it("remove maiúscula, acento e pontuação", () => {
    expect(norm("Ácido fosfórico 37%")).toBe("acidofosforico37");
  });

  it("junta grafias que só diferem em caixa", () => {
    expect(norm("FMG")).toBe(norm("Fmg"));
    expect(norm("MAXICOR")).toBe(norm("Maxicor"));
  });

  it("junta grafias que só diferem em acento", () => {
    expect(norm("Rioquimica")).toBe(norm("Rioquímica"));
  });

  it("remove espaço em vez de preservá-lo", () => {
    expect(norm("SS Plus")).toBe("ssplus");
    expect(norm("SSplus")).toBe("ssplus");
    expect(norm("tricresol formalina")).toBe("tricresolformalina");
  });

  it("NÃO junta produtos que diferem no sufixo — cor, calibre, tamanho", () => {
    expect(norm("Resina LISS - EA1")).not.toBe(norm("Resina LISS - EA2"));
    expect(norm("Protaper Universal - F2")).not.toBe(norm("Protaper Universal - F4"));
    expect(norm("Ultrapak - fio Retrator - #00")).not.toBe(norm("Ultrapak - fio Retrator - #000"));
    expect(norm("Luvas Cirugicas - 7.0")).not.toBe(norm("Luvas Cirugicas - 8.0"));
  });

  it("aceita nulo e indefinido", () => {
    expect(norm(null)).toBe("");
    expect(norm(undefined)).toBe("");
  });
});

describe("contrato entre as duas cópias", () => {
  it("core e server têm a mesma bateria de casos", () => {
    expect(CASES_CORE).toEqual(NORM_CASES);
  });

  it("core e server produzem o mesmo resultado em todos os casos", () => {
    for (const [entrada, esperado] of NORM_CASES) {
      expect(norm(entrada), `server: ${entrada}`).toBe(esperado);
      expect(normCore(entrada), `core: ${entrada}`).toBe(esperado);
    }
  });
});
