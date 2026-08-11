import { useCallback, useEffect, useState } from "react";
import type { EstoqueContagens, EstoqueLote, EstoqueProduto, EstoqueVisao } from "@app/core";
import { getEstoqueComprar, getEstoqueContagens, getEstoqueLotes } from "../api";

const PAGINA = 60;

// A rota /estoque/lotes só sabe filtrar "estoque" e "validade" — ela nunca
// lista produtos sem lote nenhum. "comprar" é servido por /estoque/comprar,
// que devolve EstoqueProduto[] (nome, marca, especialidade, lotes históricos,
// saldo), não EstoqueLote[]. Por isso essa visão usa um estado próprio
// (`produtos`) em vez de reaproveitar `lotes`.
export function useEstoque() {
  const [visao, setVisao] = useState<EstoqueVisao>("estoque");
  const [lotes, setLotes] = useState<EstoqueLote[]>([]);
  const [produtos, setProdutos] = useState<EstoqueProduto[]>([]);
  const [total, setTotal] = useState(0);
  const [contagens, setContagens] = useState<EstoqueContagens | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async (desde: number) => {
    if (visao === "comprar") {
      const r = await getEstoqueComprar();
      setProdutos(r.produtos);
      setTotal(r.produtos.length);
      return;
    }
    const r = await getEstoqueLotes({ visao, limite: PAGINA, desde });
    setTotal(r.total);
    setLotes((atual) => (desde === 0 ? r.lotes : [...atual, ...r.lotes]));
  }, [visao]);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    setLotes([]);
    setProdutos([]);
    await Promise.all([carregar(0), getEstoqueContagens().then(setContagens)]);
    setCarregando(false);
  }, [carregar]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return {
    lotes,
    produtos,
    total,
    contagens,
    visao,
    carregando,
    setVisao,
    recarregar,
    carregarMais: () => carregar(lotes.length),
  };
}
