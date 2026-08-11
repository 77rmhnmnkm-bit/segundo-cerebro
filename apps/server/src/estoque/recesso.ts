// Motor de validade. A clínica escola fecha completamente em dois períodos, e
// um lote que vence com a faculdade fechada morre antes da data impressa:
// ninguém vai usar. Este módulo calcula a data-limite real de uso.
//
// NUNCA usar toISOString() aqui: em UTC-3 ele rola para o dia anterior à noite.
// Todo cálculo usa componentes locais.

export type MotivoUsarAte = "validade" | "recesso_fim_ano" | "recesso_julho";

export type StatusLote = "vencido" | "prazo_passou" | "armadilha" | "no_prazo" | "sem_validade";

export type JanelaRecesso = {
  ultimoLetivo: { mes: number; dia: number };
  volta: { mes: number; dia: number };
};

export type CalendarioRecesso = {
  fimAno: JanelaRecesso;
  julho: JanelaRecesso;
  margemDias: number;
};

export type ResultadoUsarAte = {
  data: Date;
  motivo: MotivoUsarAte;
  diasPerdidos: number;
};

export const CALENDARIO_PADRAO: CalendarioRecesso = {
  fimAno: { ultimoLetivo: { mes: 11, dia: 30 }, volta: { mes: 3, dia: 3 } },
  julho: { ultimoLetivo: { mes: 7, dia: 29 }, volta: { mes: 8, dia: 11 } },
  margemDias: 14,
};

const dia = (ano: number, mes: number, d: number) => new Date(ano, mes - 1, d);

function somaDias(base: Date, n: number): Date {
  return dia(base.getFullYear(), base.getMonth() + 1, base.getDate() + n);
}

function diffDias(a: Date, b: Date): number {
  const ma = dia(a.getFullYear(), a.getMonth() + 1, a.getDate()).getTime();
  const mb = dia(b.getFullYear(), b.getMonth() + 1, b.getDate()).getTime();
  return Math.round((ma - mb) / 86_400_000);
}

// Para uma validade, devolve os candidatos de recesso relevantes: o par
// (último dia letivo, volta) de cada janela, ancorado no ano certo. O recesso
// de fim de ano atravessa a virada, então gera duas âncoras.
function janelas(validade: Date, cal: CalendarioRecesso) {
  const y = validade.getFullYear();
  const out: Array<{ ultimo: Date; volta: Date; motivo: MotivoUsarAte }> = [];
  for (const base of [y - 1, y]) {
    out.push({
      ultimo: dia(base, cal.fimAno.ultimoLetivo.mes, cal.fimAno.ultimoLetivo.dia),
      volta: dia(base + 1, cal.fimAno.volta.mes, cal.fimAno.volta.dia),
      motivo: "recesso_fim_ano",
    });
    out.push({
      ultimo: dia(base, cal.julho.ultimoLetivo.mes, cal.julho.ultimoLetivo.dia),
      volta: dia(base, cal.julho.volta.mes, cal.julho.volta.dia),
      motivo: "recesso_julho",
    });
  }
  return out;
}

export function usarAte(validade: Date, cal: CalendarioRecesso = CALENDARIO_PADRAO): ResultadoUsarAte {
  for (const j of janelas(validade, cal)) {
    const dentroDoRecesso = validade > j.ultimo && validade < j.volta;
    const logoAposAVolta = validade >= j.volta && diffDias(validade, j.volta) < cal.margemDias;
    if (dentroDoRecesso || logoAposAVolta) {
      return { data: j.ultimo, motivo: j.motivo, diasPerdidos: diffDias(validade, j.ultimo) };
    }
  }
  return { data: validade, motivo: "validade", diasPerdidos: 0 };
}

export function classificar(
  validade: Date | null,
  quantidade: number,
  hoje: Date,
  cal: CalendarioRecesso = CALENDARIO_PADRAO,
): StatusLote {
  if (!validade) return "sem_validade";
  if (diffDias(validade, hoje) < 0) return "vencido";
  const r = usarAte(validade, cal);
  if (diffDias(r.data, hoje) < 0) return "vencido";
  return r.motivo === "validade" ? "no_prazo" : "armadilha";
}
