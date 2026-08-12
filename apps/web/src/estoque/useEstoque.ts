import { useCallback, useEffect, useMemo, useState } from "react";
import type { EstoqueContagens, EstoqueFiltros, EstoqueLote, EstoqueProduto, EstoqueVisao } from "@app/core";
import { getEstoqueComprar, getEstoqueContagens, getEstoqueFiltros, getEstoqueLotes } from "../api";

const PAGINA = 60;
const ATRASO_BUSCA_MS = 300;

// A rota /estoque/lotes só sabe filtrar "estoque" e "validade" — ela nunca
// lista produtos sem lote nenhum. "comprar" é servido por /estoque/comprar,
// que devolve EstoqueProduto[] (nome, marca, especialidade, lotes históricos,
// saldo), não EstoqueLote[]. Por isso essa visão usa um estado próprio
// (`produtos`) em vez de reaproveitar `lotes`, e os filtros de busca/especialidade
// são aplicados no cliente (a lista de "comprar" já vem inteira, sem paginação).
export function useEstoque() {
  const [visao, setVisao] = useState<EstoqueVisao>("estoque");
  const [modo, setModo] = useState<"lista" | "icones">("lista");

  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [especialidade, setEspecialidade] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [soFalta, setSoFalta] = useState(false);
  const [soAberto, setSoAberto] = useState(false);

  const [lotes, setLotes] = useState<EstoqueLote[]>([]);
  const [produtos, setProdutos] = useState<EstoqueProduto[]>([]);
  const [total, setTotal] = useState(0);
  const [contagens, setContagens] = useState<EstoqueContagens | null>(null);
  const [filtros, setFiltros] = useState<EstoqueFiltros | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Busca tem atraso de 300ms antes de bater na API — mesmo padrão usado em
  // PatientsScreen. Sem isso, cada tecla digitada dispara uma requisição.
  useEffect(() => {
    const t = setTimeout(() => setBusca(buscaInput.trim()), ATRASO_BUSCA_MS);
    return () => clearTimeout(t);
  }, [buscaInput]);

  useEffect(() => {
    getEstoqueFiltros().then(setFiltros);
  }, []);

  const carregar = useCallback(
    async (desde: number) => {
      if (visao === "comprar") {
        const r = await getEstoqueComprar();
        setProdutos(r.produtos);
        setTotal(r.produtos.length);
        return;
      }
      const r = await getEstoqueLotes({
        visao,
        limite: PAGINA,
        desde,
        especialidade: especialidade ?? undefined,
        local: local ?? undefined,
        busca: busca || undefined,
        soFalta: soFalta || undefined,
        soAberto: soAberto || undefined,
      });
      setTotal(r.total);
      setLotes((atual) => (desde === 0 ? r.lotes : [...atual, ...r.lotes]));
    },
    [visao, especialidade, local, busca, soFalta, soAberto],
  );

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

  // A visão "comprar" não pagina no servidor — os filtros de busca e
  // especialidade (os únicos que fazem sentido para um produto sem lote) são
  // aplicados aqui. Local e "só mostrar" não têm equivalente em um produto
  // que não tem lote físico nenhum.
  const produtosFiltrados = useMemo(() => {
    let r = produtos;
    if (especialidade) r = r.filter((p) => p.especialidade === especialidade);
    if (busca) {
      const termo = busca.toLowerCase();
      r = r.filter((p) => p.nome.toLowerCase().includes(termo) || (p.marca ?? "").toLowerCase().includes(termo));
    }
    return r;
  }, [produtos, especialidade, busca]);

  function limparFiltros() {
    setEspecialidade(null);
    setLocal(null);
    setSoFalta(false);
    setSoAberto(false);
  }

  const filtrosAtivos = Boolean(especialidade || local || soFalta || soAberto);

  return {
    lotes,
    produtos: produtosFiltrados,
    total: visao === "comprar" ? produtosFiltrados.length : total,
    totalCarregado: visao === "comprar" ? produtosFiltrados.length : lotes.length,
    contagens,
    filtros,
    visao,
    modo,
    setModo,
    carregando,
    setVisao,
    recarregar,
    carregarMais: () => carregar(lotes.length),
    buscaInput,
    setBuscaInput,
    busca,
    especialidade,
    setEspecialidade,
    local,
    setLocal,
    soFalta,
    setSoFalta,
    soAberto,
    setSoAberto,
    limparFiltros,
    filtrosAtivos,
  };
}
