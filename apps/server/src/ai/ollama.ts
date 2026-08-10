const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct";
const VISION_MODEL = process.env.OLLAMA_VISION_MODEL ?? "llava:7b";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Descrição de imagem por modelo de visão local (llava). É um modelo de
// visão GERAL, não um detector odontológico validado — por isso só descreve
// o que observa, sempre como apoio experimental e não-diagnóstico. Lança
// erro claro se o modelo de visão não estiver instalado.
export async function describeImage(base64Image: string, prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [{ role: "user", content: prompt, images: [base64Image] }],
      stream: false,
    }),
  });

  if (res.status === 404) {
    throw new Error(`Modelo de visão "${VISION_MODEL}" ainda não instalado. Rode: ollama pull ${VISION_MODEL}`);
  }
  if (!res.ok) {
    throw new Error(`Ollama indisponível (${res.status}). O modelo de visão está instalado e o serviço rodando?`);
  }

  const data = (await res.json()) as { message: { content: string } };
  return data.message.content.trim();
}

export async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, stream: false }),
  });

  if (!res.ok) {
    throw new Error(`Ollama indisponível (${res.status}). O modelo está instalado e o serviço rodando?`);
  }

  const data = (await res.json()) as { message: { content: string } };
  return data.message.content.trim();
}

export interface EventExtraction {
  title: string;
  category: "atendimento_paciente" | "pessoal" | "academico";
  time: string;
  dateType: "hoje" | "amanha" | "absoluta" | "dia_semana";
  absoluteDate: string | null;
  weekday: string | null;
  nextWeek: boolean;
  locationText: string | null;
  description: string | null;
}

const WEEKDAY_INDEX: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  "segunda-feira": 1,
  terca: 2,
  "terça": 2,
  "terça-feira": 2,
  quarta: 3,
  "quarta-feira": 3,
  quinta: 4,
  "quinta-feira": 4,
  sexta: 5,
  "sexta-feira": 5,
  sabado: 6,
  "sábado": 6,
};

// Calendar math for relative weekday references is done here in code, not by
// the model — small LLMs are unreliable at exact date arithmetic (verified:
// asked for "sexta" from a Saturday reference, got a Tuesday back). The model
// only has to recognize *which* weekday was said, which it does reliably.
export function resolveWeekday(reference: Date, weekday: string, nextWeek: boolean): Date {
  const targetDay = WEEKDAY_INDEX[weekday.toLowerCase()];
  if (targetDay === undefined) return reference;

  let diff = (targetDay - reference.getDay() + 7) % 7;
  if (diff === 0 && nextWeek) diff = 7;

  const result = new Date(reference);
  result.setDate(reference.getDate() + diff);
  return result;
}

// Date objects always carry a time-of-day; converting via toISOString() shifts
// to UTC first, which silently rolls the calendar date over whenever local
// time is late enough (e.g. 21:00 in UTC-3 is already "tomorrow" in UTC).
// Reading the local y/m/d components directly avoids that trap.
function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Small local models are unreliable at exact time-of-day phrases (verified:
// "meio dia" was misread as 09:00) — same problem as weekday math. We parse
// explicit PT-BR time expressions deterministically and prefer that over
// whatever the model guessed, instead of trusting it blindly.
function applyPeriod(hour: number, period: string | undefined): number {
  if (period === "tarde" || period === "noite") {
    if (hour < 12) return hour + 12;
  } else if (period === "manhã" && hour === 12) {
    return 0;
  }
  return hour;
}

export function parseExplicitTime(text: string): string | null {
  const lower = text.toLowerCase();

  if (/meia[\s-]?noite/.test(lower)) return "00:00";
  if (/meio[\s-]?dia\s*e\s*meia/.test(lower)) return "12:30";
  if (/meio[\s-]?dia/.test(lower)) return "12:00";

  // Each pattern below requires an explicit time *marker* (colon, "h", "horas",
  // "e meia/quinze/trinta", a period of day, or "às") — a bare number like in
  // "dia 5" must never be read as a time.
  const patterns: RegExp[] = [
    /(\d{1,2})\s*[:h]\s*(\d{1,2})?\s*(?:(?:da|de)\s*(manhã|tarde|noite))?/,
    /(\d{1,2})\s*horas?\s*(?:e\s*(meia|quinze|trinta))?\s*(?:(?:da|de)\s*(manhã|tarde|noite))?/,
    /(\d{1,2})\s*e\s*(meia|quinze|trinta)\s*(?:(?:da|de)\s*(manhã|tarde|noite))?/,
    /às\s*(\d{1,2})\s*(?:(?:da|de)\s*(manhã|tarde|noite))?/,
    /(\d{1,2})\s*(?:da|de)\s*(manhã|tarde|noite)/,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (!match) continue;

    const hour = Number(match[1]);
    if (Number.isNaN(hour) || hour > 23) continue;

    let minute = 0;
    const suffix = match[2];
    let period: string | undefined = match[3];
    if (suffix === "meia") minute = 30;
    else if (suffix === "quinze") minute = 15;
    else if (suffix === "trinta") minute = 30;
    else if (suffix && /^\d+$/.test(suffix)) minute = Number(suffix);
    else if (suffix && !period) period = suffix; // patterns where group 2 is the period itself

    if (minute > 59) continue;

    const resolvedHour = applyPeriod(hour, period);
    return `${String(resolvedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  return null;
}

function buildPrompt(text: string, referenceDate: Date): string {
  const todayIso = referenceDate.toISOString().slice(0, 10);
  const weekday = referenceDate.toLocaleDateString("pt-BR", { weekday: "long" });

  return `Você é um extrator de eventos de agenda para um dentista. A partir do texto do usuário, extraia UM evento e responda APENAS com um JSON válido (sem texto antes ou depois, sem markdown), exatamente neste formato:
{"title": string, "category": "atendimento_paciente" | "pessoal" | "academico", "time": "HH:MM", "dateType": "hoje" | "amanha" | "absoluta" | "dia_semana", "absoluteDate": "AAAA-MM-DD" ou null, "weekday": "segunda" | "terca" | "quarta" | "quinta" | "sexta" | "sabado" | "domingo" ou null, "nextWeek": boolean, "locationText": string ou null, "description": string ou null}

IMPORTANTE: não calcule datas você mesmo. Apenas classifique o que o texto disse:
- Se disser "hoje": dateType="hoje".
- Se disser "amanhã": dateType="amanha".
- Se mencionar um dia da semana ("sexta", "terça-feira", etc, com ou sem "que vem"/"próxima"): dateType="dia_semana", weekday=o dia mencionado, nextWeek=true se disser "que vem" ou "próxima", senão false.
- Se mencionar uma data explícita ("dia 30", "15 de julho", "30/06"): dateType="absoluta", absoluteDate="AAAA-MM-DD" (assuma o ano de ${referenceDate.getFullYear()} se não disser o ano).
- Se não houver horário explícito, use "09:00".

Regras de classificação de categoria:
- "atendimento_paciente": menciona paciente, consulta, atendimento clínico, procedimento odontológico.
- "academico": menciona aula, prova, faculdade, TCC, estágio, congresso.
- "pessoal": qualquer outro compromisso (família, lazer, pessoal).

Hoje é ${weekday}, ${todayIso}. Use isso só como referência de contexto, não para calcular a data de resposta.

Texto do usuário: "${text.replace(/"/g, "'")}"`;
}

export async function extractEventFromText(text: string, referenceDate = new Date()) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: buildPrompt(text, referenceDate) }],
      format: "json",
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama indisponível (${res.status}). O modelo está instalado e o serviço rodando?`);
  }

  const data = (await res.json()) as { message: { content: string } };

  let parsed: EventExtraction;
  try {
    parsed = JSON.parse(data.message.content);
  } catch {
    throw new Error("A IA retornou uma resposta que não pôde ser interpretada. Tente reformular o texto.");
  }

  let resolvedDate: Date;
  if (parsed.dateType === "hoje") {
    resolvedDate = referenceDate;
  } else if (parsed.dateType === "amanha") {
    resolvedDate = new Date(referenceDate);
    resolvedDate.setDate(referenceDate.getDate() + 1);
  } else if (parsed.dateType === "absoluta" && parsed.absoluteDate) {
    resolvedDate = new Date(`${parsed.absoluteDate}T00:00:00`);
  } else if (parsed.dateType === "dia_semana" && parsed.weekday) {
    resolvedDate = resolveWeekday(referenceDate, parsed.weekday, parsed.nextWeek);
  } else {
    resolvedDate = referenceDate;
  }

  const explicitTime = parseExplicitTime(text);

  return {
    title: parsed.title,
    category: parsed.category,
    date: toLocalDateString(resolvedDate),
    time: explicitTime ?? parsed.time ?? "09:00",
    locationText: parsed.locationText,
    description: parsed.description,
  };
}
