import { describe, it, expect } from "vitest";
import { usarAte, classificar, CALENDARIO_PADRAO } from "./recesso.js";

const d = (ano: number, mes: number, dia: number) => new Date(ano, mes - 1, dia);
const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

describe("usarAte — recesso de fim de ano", () => {
  it("dezembro cai no recesso e recua para 30/11 do mesmo ano", () => {
    const r = usarAte(d(2026, 12, 22));
    expect(iso(r.data)).toBe("2026-11-30");
    expect(r.motivo).toBe("recesso_fim_ano");
    expect(r.diasPerdidos).toBe(22);
  });

  it("janeiro recua para 30/11 do ano ANTERIOR", () => {
    const r = usarAte(d(2027, 1, 1));
    expect(iso(r.data)).toBe("2026-11-30");
    expect(r.motivo).toBe("recesso_fim_ano");
  });

  it("fevereiro recua para 30/11 do ano anterior", () => {
    expect(iso(usarAte(d(2027, 2, 1)).data)).toBe("2026-11-30");
  });

  it("01/03 ainda é recesso — a volta é dia 3", () => {
    const r = usarAte(d(2027, 3, 1));
    expect(iso(r.data)).toBe("2026-11-30");
    expect(r.diasPerdidos).toBe(91);
  });

  it("30/11 é o último dia letivo e não é armadilha", () => {
    const r = usarAte(d(2026, 11, 30));
    expect(iso(r.data)).toBe("2026-11-30");
    expect(r.motivo).toBe("validade");
    expect(r.diasPerdidos).toBe(0);
  });
});

describe("usarAte — margem de 14 dias após a volta", () => {
  it("vencer no próprio dia da volta é armadilha", () => {
    const r = usarAte(d(2027, 3, 3));
    expect(iso(r.data)).toBe("2026-11-30");
    expect(r.motivo).toBe("recesso_fim_ano");
  });

  it("vencer 13 dias após a volta ainda é armadilha", () => {
    expect(usarAte(d(2027, 3, 16)).motivo).toBe("recesso_fim_ano");
  });

  it("vencer exatamente 14 dias após a volta já é seguro", () => {
    const r = usarAte(d(2027, 3, 17));
    expect(iso(r.data)).toBe("2027-03-17");
    expect(r.motivo).toBe("validade");
  });
});

describe("usarAte — recesso de julho", () => {
  it("julho até o dia 29 é letivo e seguro", () => {
    const r = usarAte(d(2027, 7, 15));
    expect(iso(r.data)).toBe("2027-07-15");
    expect(r.motivo).toBe("validade");
  });

  it("30/07 já é recesso e recua para 29/07", () => {
    const r = usarAte(d(2027, 7, 30));
    expect(iso(r.data)).toBe("2027-07-29");
    expect(r.motivo).toBe("recesso_julho");
  });

  it("01/08 recua para 29/07", () => {
    const r = usarAte(d(2027, 8, 1));
    expect(iso(r.data)).toBe("2027-07-29");
    expect(r.diasPerdidos).toBe(3);
  });

  it("11/08 é a volta e ainda é armadilha pela margem", () => {
    expect(usarAte(d(2027, 8, 11)).motivo).toBe("recesso_julho");
  });

  it("25/08 é 14 dias após a volta e já é seguro", () => {
    expect(usarAte(d(2027, 8, 25)).motivo).toBe("validade");
  });
});

describe("usarAte — calendário configurável", () => {
  it("respeita um calendário diferente do padrão", () => {
    const cal = {
      ...CALENDARIO_PADRAO,
      margemDias: 0,
    };
    expect(usarAte(d(2027, 3, 3), cal).motivo).toBe("validade");
  });
});

describe("classificar", () => {
  const hoje = d(2026, 8, 10);

  it("sem validade informada", () => {
    expect(classificar(null, 5, hoje)).toBe("sem_validade");
  });

  it("validade já passou", () => {
    expect(classificar(d(2026, 8, 1), 5, hoje)).toBe("vencido");
  });

  it("dentro da validade mas o prazo real já passou", () => {
    expect(classificar(d(2026, 8, 5), 5, d(2026, 8, 3))).toBe("vencido");
  });

  it("armadilha de recesso ainda no futuro", () => {
    expect(classificar(d(2026, 12, 22), 5, hoje)).toBe("armadilha");
  });

  it("no prazo", () => {
    expect(classificar(d(2027, 6, 1), 5, hoje)).toBe("no_prazo");
  });
});
