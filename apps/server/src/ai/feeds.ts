import { XMLParser } from "fast-xml-parser";
import { pool } from "../db/pool.js";
import { chatCompletion } from "./ollama.js";

// Only verified, official/reputable sources go here — no random blogs/forums.
// Each entry needs a real, working RSS feed checked by hand (curl) before being added.
const TRUSTED_FEEDS = [
  { name: "CFO — Conselho Federal de Odontologia", url: "https://website.cfo.org.br/feed/", language: "pt", dentalSpecific: true },
  {
    name: "ANVISA — Agência Nacional de Vigilância Sanitária",
    url: "https://www.gov.br/anvisa/pt-br/rss.xml",
    language: "pt",
    dentalSpecific: false,
  },
  { name: "FDI World Dental Federation", url: "https://www.fdiworlddental.org/rss.xml", language: "en", dentalSpecific: true },
  { name: "British Dental Journal (Springer Nature)", url: "https://www.nature.com/bdj.rss", language: "en", dentalSpecific: true },
  {
    name: "EFP — European Federation of Periodontology",
    url: "https://www.efp.org/feed/",
    language: "en",
    dentalSpecific: true,
  },
  {
    name: "IADR — International Association for Dental Research",
    url: "https://www.iadr.org/rss.xml",
    language: "en",
    dentalSpecific: true,
  },
];

// Pesquisas restritas a PubMed (API oficial gratuita, sem necessidade de
// chave) — só revisão sistemática, diretriz clínica ou metanálise, nunca
// estudo isolado solto. Cobre exatamente o tipo de "padrão-ouro mudou" que
// notícia/podcast não tem: literatura revisada por pares de verdade.
// Cada entrada usa filtro de revista ([ta]) ou autor-corporativo (associação),
// restrito a revisão sistemática/diretriz/metanálise — cobre praticamente
// todos os periódicos e associações que a literatura de odontologia indexa,
// sem precisar bater na proteção anti-bot de cada editora individualmente.
const SR_FILTER = "(systematic review[pt] OR guideline[pt] OR meta-analysis[pt])";
const PUBMED_SEARCHES = [
  {
    name: "PubMed — Protocolos de irrigação em Endodontia",
    term: `(root canal irrigation OR final irrigation protocol) AND endodontics AND ${SR_FILTER}`,
  },
  {
    name: "PubMed — Sistemas adesivos em Dentística",
    term: `(adhesive system OR bonding agent) AND (restorative dentistry OR dental adhesion) AND ${SR_FILTER}`,
  },
  {
    name: "PubMed — Cochrane (Odontologia)",
    term: `"Cochrane Database Syst Rev"[ta] AND (dental[ti] OR oral health[ti] OR endodontic[ti] OR periodontal[ti] OR orthodontic[ti] OR caries[ti])`,
  },
  {
    name: "PubMed — Periódicos gerais de alto impacto",
    term: `("J Dent Res"[ta] OR "J Dent"[ta] OR "Clin Oral Investig"[ta] OR "Br Dent J"[ta] OR "J Am Dent Assoc"[ta]) AND ${SR_FILTER}`,
  },
  {
    name: "PubMed — Endodontia (periódicos)",
    term: `("J Endod"[ta] OR "Int Endod J"[ta]) AND ${SR_FILTER}`,
  },
  {
    name: "PubMed — Periodontia e Implantodontia",
    term: `("J Clin Periodontol"[ta] OR "J Periodontol"[ta] OR "Clin Oral Implants Res"[ta]) AND ${SR_FILTER}`,
  },
  {
    name: "PubMed — Ortodontia",
    term: `("Am J Orthod Dentofacial Orthop"[ta] OR "Angle Orthod"[ta] OR "Eur J Orthod"[ta]) AND ${SR_FILTER}`,
  },
  {
    name: "PubMed — Odontopediatria",
    term: `"Pediatr Dent"[ta] AND ${SR_FILTER}`,
  },
  {
    name: "PubMed — Prótese e Reabilitação Oral",
    term: `("J Prosthet Dent"[ta] OR "J Oral Rehabil"[ta] OR "Int J Prosthodont"[ta]) AND ${SR_FILTER}`,
  },
  {
    name: "PubMed — Dentística e Materiais",
    term: `("Oper Dent"[ta] OR "Dent Mater"[ta] OR "J Esthet Restor Dent"[ta]) AND ${SR_FILTER}`,
  },
  {
    name: "PubMed — Cirurgia Bucomaxilofacial",
    term: `("J Oral Maxillofac Surg"[ta] OR "Int J Oral Maxillofac Surg"[ta]) AND ${SR_FILTER}`,
  },
  {
    name: "PubMed — Radiologia, Patologia e Estomatologia",
    term: `("Dentomaxillofac Radiol"[ta] OR "Oral Dis"[ta] OR "Oral Oncol"[ta] OR "Oral Surg Oral Med Oral Pathol Oral Radiol"[ta]) AND ${SR_FILTER}`,
  },
  {
    name: "PubMed — Diretrizes de associações (ADA, AAE, AAPD, EFP, AAO, AAOMS)",
    term: `"American Dental Association"[Corporate Author] OR "American Association of Endodontists"[Corporate Author] OR "American Academy of Pediatric Dentistry"[Corporate Author] OR "European Federation of Periodontology"[Corporate Author] OR "American Association of Orthodontists"[Corporate Author] OR "American Association of Oral and Maxillofacial Surgeons"[Corporate Author]`,
  },
];

// ANVISA (and any future general health regulator) publishes mostly non-dental news.
// Only keep items that actually mention dentistry/oral health/dental biosafety keywords.
const DENTAL_KEYWORDS = [
  "odont",
  "dental",
  "dentist",
  "bucal",
  "boca",
  "biosseguran",
  "esteriliza",
  "instrumental cirúrgico",
  "anestésico",
  "anestesia local",
];

function isDentalRelevant(title: string): boolean {
  const lower = title.toLowerCase();
  return DENTAL_KEYWORDS.some((kw) => lower.includes(kw));
}

export type UpdateCategory = "clinico" | "politico" | "outro";
export type EvidenceLevel = "comprovado" | "novidade" | "indefinido";

const parser = new XMLParser({
  ignoreAttributes: false,
  processEntities: { enabled: true, maxTotalExpansions: 50000 },
});

interface FeedItem {
  sourceName: string;
  title: string;
  link: string;
  publishedAt: Date | null;
  language: string;
}

async function classify(title: string): Promise<{ category: UpdateCategory; evidence: EvidenceLevel }> {
  const prompt = `Classifique esta manchete de uma fonte oficial da área da saúde/odontologia em duas dimensões. Responda EXATAMENTE no formato "categoria,evidencia" (duas palavras separadas por vírgula, sem mais nada).

Dimensão "categoria":
- clinico: muda algo na prática clínica — diretriz, nota técnica que regula um procedimento, novo padrão-ouro, mudança de paradigma, achado científico.
- politico: piso salarial, sindicato, eventos, benefícios, lobby, notícia institucional/administrativa sem efeito direto na prática.
- outro: não se encaixa nos dois, ou é de outra área da saúde sem relação com odontologia.

Dimensão "evidencia":
- comprovado: baseado em diretriz oficial publicada, nota técnica regulatória, revisão sistemática ou consenso de associação/conselho — coisa já validada.
- novidade: pesquisa preliminar, estudo isolado, hipótese, inovação ainda não consolidada como padrão — não é achismo proibido, é só ainda não é consenso.
- indefinido: não há informação suficiente na manchete para decidir.

Manchete: "${title}"
Responda só "categoria,evidencia".`;
  try {
    const result = (await chatCompletion([{ role: "user", content: prompt }])).trim().toLowerCase();
    const category: UpdateCategory = result.includes("clinico") ? "clinico" : result.includes("politico") ? "politico" : "outro";
    const evidence: EvidenceLevel = result.includes("comprovado")
      ? "comprovado"
      : result.includes("novidade")
        ? "novidade"
        : "indefinido";
    return { category, evidence };
  } catch {
    return { category: "outro", evidence: "indefinido" };
  }
}

async function translateTitle(title: string): Promise<string> {
  const prompt = `Traduza esta manchete de odontologia/saúde para português claro e natural, mantendo o sentido técnico. Responda só com a tradução, sem aspas e sem comentários:

"${title}"`;
  try {
    const result = await chatCompletion([{ role: "user", content: prompt }]);
    return result.trim().replace(/^"|"$/g, "");
  } catch {
    return title;
  }
}

function extractItems(parsed: Record<string, unknown>): Record<string, unknown>[] {
  const rss = parsed?.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  if (channel?.item) {
    const items = channel.item;
    return Array.isArray(items) ? (items as Record<string, unknown>[]) : [items as Record<string, unknown>];
  }

  const rdf = parsed?.["rdf:RDF"] as Record<string, unknown> | undefined;
  if (rdf?.item) {
    const items = rdf.item;
    return Array.isArray(items) ? (items as Record<string, unknown>[]) : [items as Record<string, unknown>];
  }

  return [];
}

async function fetchFeed(source: { name: string; url: string; language: string }): Promise<FeedItem[]> {
  const res = await fetch(source.url, { headers: { "User-Agent": "SegundoCerebro/1.0" } });
  if (!res.ok) throw new Error(`Falha ao buscar ${source.name}: ${res.status}`);
  const xml = await res.text();
  const parsed = parser.parse(xml);
  const itemArray = extractItems(parsed);

  return itemArray
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const rawDate = item.pubDate ?? item["dc:date"];
      const link = item.link ?? item.guid;
      return {
        sourceName: source.name,
        title: String(item.title ?? "").trim(),
        link: String(typeof link === "object" ? (link as Record<string, unknown>)["#text"] ?? "" : link ?? "").trim(),
        publishedAt: rawDate ? new Date(String(rawDate)) : null,
        language: source.language,
      };
    })
    .filter((item) => item.title && item.link);
}

async function fetchPubMedSearch(search: { name: string; term: string }): Promise<FeedItem[]> {
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmax=3&sort=pub+date&retmode=json&term=${encodeURIComponent(search.term)}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) throw new Error(`Falha ao buscar PubMed (${search.name}): ${searchRes.status}`);
  const searchData = (await searchRes.json()) as { esearchresult?: { idlist?: string[] } };
  const ids = searchData.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`;
  const summaryRes = await fetch(summaryUrl);
  if (!summaryRes.ok) throw new Error(`Falha ao buscar resumo PubMed (${search.name}): ${summaryRes.status}`);
  const summaryData = (await summaryRes.json()) as { result?: Record<string, { title?: string; pubdate?: string; uid?: string }> };
  const result = summaryData.result ?? {};

  return ids
    .map((id) => result[id])
    .filter((doc): doc is { title: string; pubdate?: string; uid?: string } => !!doc?.title)
    .map((doc) => ({
      sourceName: search.name,
      title: doc.title,
      link: `https://pubmed.ncbi.nlm.nih.gov/${doc.uid ?? ""}/`,
      publishedAt: doc.pubdate ? new Date(doc.pubdate) : null,
      language: "en",
    }));
}

async function insertItem(
  item: FeedItem,
  forced?: { category: UpdateCategory; evidence: EvidenceLevel },
): Promise<number> {
  const existing = await pool.query("select 1 from dental_updates where link = $1", [item.link]);
  if (existing.rowCount) return 0;

  const { category, evidence } = forced ?? (await classify(item.title));
  const title = item.language === "pt" ? item.title : await translateTitle(item.title);
  const titleOriginal = item.language === "pt" ? null : item.title;

  const result = await pool.query(
    `insert into dental_updates (source_name, title, title_original, source_language, link, published_at, category, evidence_level)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (link) do nothing`,
    [item.sourceName, title, titleOriginal, item.language, item.link, item.publishedAt, category, evidence],
  );
  return result.rowCount ?? 0;
}

export async function refreshDentalUpdates(): Promise<{ added: number; errors: string[] }> {
  let added = 0;
  const errors: string[] = [];

  for (const source of TRUSTED_FEEDS) {
    try {
      const items = await fetchFeed(source);
      for (const item of items.slice(0, 15)) {
        if (!source.dentalSpecific && !isDentalRelevant(item.title)) continue;
        added += await insertItem(item);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // PubMed: restrito por construção a revisão sistemática/diretriz/metanálise,
  // então já entra como clínico+comprovado sem precisar classificar de novo.
  // Sem chave de API, o NCBI permite só ~3 req/s — uma pequena pausa entre
  // buscas evita 429 quando rodamos as 13 buscas em sequência.
  for (const search of PUBMED_SEARCHES) {
    try {
      const items = await fetchPubMedSearch(search);
      for (const item of items) {
        added += await insertItem(item, { category: "clinico", evidence: "comprovado" });
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return { added, errors };
}
