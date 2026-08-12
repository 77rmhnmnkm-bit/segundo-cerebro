import { useEffect, useState } from "react";
import { getEstoqueContagens, getEstoqueLotes } from "../api";

export type Aviso = {
  id: string;
  rotulo: string;
  texto: string;
  justificativa: string;
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function dataBr(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function dataExtenso(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} de ${MESES[Number(m) - 1]}`;
}

// Painel do revisor: cada aviso é calculado a partir do que a API já devolve
// (contagens + a própria lista de lotes em "validade"), nunca de um número
// fixo no código. Se a base não tiver o padrão descrito, o aviso some — nada
// de mostrar "0 lotes vencidos" ou inventar uma data sem lote nenhum atrás.
export function useRevisorAvisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [contagens, validadeResp] = await Promise.all([
          getEstoqueContagens(),
          // visao=validade é exatamente o conjunto "armadilha": prazo real
          // ainda não passou, mas já é anterior à validade impressa. O total
          // real (54 na base atual) sempre cabe no teto de 200 da rota, então
          // esta chamada única já traz todos — sem paginar.
          getEstoqueLotes({ visao: "validade", limite: 200 }),
        ]);
        if (!ativo) return;

        const lista: Aviso[] = [];

        if (contagens.vencidosComEstoque > 0) {
          const n = contagens.vencidosComEstoque;
          lista.push({
            id: "vencidos-com-estoque",
            rotulo: "conferir agora",
            texto: `${n} lote${n === 1 ? "" : "s"} vencido${n === 1 ? "" : "s"} ainda ${n === 1 ? "tem" : "têm"} estoque físico.`,
            justificativa: "Regra determinística: validade impressa já passou e o saldo é maior que zero. Não depende de IA.",
          });
        }

        const porData = new Map<string, number>();
        for (const l of validadeResp.lotes) {
          if (!l.usarAte) continue;
          porData.set(l.usarAte, (porData.get(l.usarAte) ?? 0) + 1);
        }
        let top: [string, number] | null = null;
        for (const par of porData) {
          if (!top || par[1] > top[1]) top = par;
        }
        if (top) {
          const [data, n] = top;
          lista.push({
            id: "prazo-real",
            rotulo: "planejamento",
            texto: `${n} lote${n === 1 ? "" : "s"} ${n === 1 ? "tem" : "têm"} prazo real em ${dataBr(data)} (${dataExtenso(data)}), antes da validade impressa.`,
            justificativa: "O prazo real considera o fechamento da clínica no recesso; a validade impressa da caixa, não.",
          });
        }

        setAvisos(lista);
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  return { avisos, carregando };
}
