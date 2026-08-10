import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";
import { chatCompletion, type ChatMessage } from "../ai/ollama.js";
import { buildContext, buildPatientContext } from "../ai/assistantContext.js";

const HISTORY_LIMIT = 20;

export async function assistantRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/assistant/memory", async () => {
    const result = await pool.query(
      "select * from assistant_memory order by created_at desc limit 100",
    );
    return { messages: result.rows.reverse() };
  });

  app.delete("/assistant/memory", async (_req, reply) => {
    await pool.query("delete from assistant_memory");
    return reply.code(204).send();
  });

  // Unprompted remark — the "talks to me without me asking, like a friend"
  // feature. Ephemeral (not written to assistant_memory) so it doesn't
  // pollute the real conversation; the frontend throttles how often it asks.
  app.get("/assistant/proactive-tip", async (_req, reply) => {
    const personalityResult = await pool.query(
      "select value from app_settings where key = 'assistant_personality'",
    );
    const personality = personalityResult.rows[0]?.value ?? "Direto e prestativo.";
    const context = await buildContext("");

    const prompt = `Você é o assistente pessoal de um estudante de Odontologia. Personalidade: ${personality}

Olhe o contexto abaixo como um amigo observador, não como alguém respondendo uma pergunta. Se notar algo que vale um comentário espontâneo (estoque baixo, compromisso próximo, retorno atrasado, nota pendente, ou só um incentivo do dia), escreva UM comentário curto e caloroso (1-2 frases), em português, baseado SOMENTE no que está no contexto — nunca invente nada. Se não houver nada que mereça comentário, responda exatamente "NADA".

Contexto atual:
${context}`;

    try {
      const tip = await chatCompletion([{ role: "user", content: prompt }]);
      if (tip.trim().toUpperCase().includes("NADA")) return { tip: null };
      return { tip: tip.trim() };
    } catch {
      return { tip: null };
    }
  });

  const MODULE_FOCUS: Record<string, string> = {
    estoque: "estoque (itens em falta, vencendo, ou lista de desejos)",
    agenda: "agenda (compromissos de hoje, próximos retornos)",
    financeiro: "financeiro (valores a receber, pagamentos pendentes, despesas)",
    biblioteca: "biblioteca clínica (procedimentos, casos, calculadoras)",
  };

  // Same "consciência" mechanism as o patient-tip, mas para as outras telas
  // do app — o assistente percebe em qual módulo você está há um tempo e
  // comenta algo real daquela área, não um aviso genérico do dia.
  app.get("/assistant/module-tip/:module", async (req, reply) => {
    const { module } = req.params as { module: string };
    const focus = MODULE_FOCUS[module];
    if (!focus) return reply.code(400).send({ error: "Módulo desconhecido." });

    const personalityResult = await pool.query(
      "select value from app_settings where key = 'assistant_personality'",
    );
    const personality = personalityResult.rows[0]?.value ?? "Direto e prestativo.";
    const context = await buildContext("");

    const prompt = `Você é o assistente pessoal de um estudante de Odontologia, acompanhando-o em tempo real. Ele está há um tempo na tela de ${focus}. Personalidade: ${personality}

Olhe o contexto abaixo com foco nessa área específica e escreva UM comentário curto (1-2 frases), em português, caloroso e natural como um amigo comentaria — cite algo REAL e específico do contexto, nunca invente. Se não houver nada relevante a essa área específica, responda exatamente "NADA".

Contexto atual:
${context}`;

    try {
      const tip = await chatCompletion([{ role: "user", content: prompt }]);
      if (tip.trim().toUpperCase().includes("NADA")) return { tip: null };
      return { tip: tip.trim() };
    } catch {
      return { tip: null };
    }
  });

  // Autonomous, unprompted remark about the patient the user has had open
  // for a while — this is the "consciência de contexto" feature: the
  // assistant notices real, specific facts about THIS patient (not a canned
  // joke) and decides on its own whether there's something worth saying.
  app.get("/assistant/patient-tip/:patientId", async (req) => {
    const { patientId } = req.params as { patientId: string };
    const personalityResult = await pool.query(
      "select value from app_settings where key = 'assistant_personality'",
    );
    const personality = personalityResult.rows[0]?.value ?? "Direto e prestativo.";
    const context = await buildPatientContext(patientId);

    const prompt = `Você é o assistente pessoal de um estudante de Odontologia, e está acompanhando ele em tempo real enquanto ele trabalha na ficha de um paciente específico há um tempo. Personalidade: ${personality}

Exemplo do tom esperado: se o paciente tem várias condições (cárie, dente ausente, implante), diga algo como "Esse paciente tem de tudo! Já que está aqui, dá uma olhada na pendência do dente 13."

Regra obrigatória: se o contexto tiver QUALQUER odontograma com status diferente de "saudavel", QUALQUER etapa de tratamento "pendente", ou QUALQUER evolução registrada, você DEVE escrever um comentário — isso já é suficiente, não é opcional. "NADA" só é permitido se a seção de contexto disser literalmente que o paciente não tem dados registrados.

Escreva UM comentário curto (1-2 frases), em português, citando algo REAL e específico do contexto — nunca invente.

Contexto do paciente:
${context}`;

    try {
      const tip = await chatCompletion([{ role: "user", content: prompt }]);
      if (tip.trim().toUpperCase().includes("NADA")) return { tip: null };
      return { tip: tip.trim() };
    } catch {
      return { tip: null };
    }
  });

  app.post("/assistant/chat", async (req, reply) => {
    const { message } = req.body as { message: string };
    if (!message?.trim()) return reply.code(400).send({ error: "message é obrigatório." });

    const personalityResult = await pool.query(
      "select value from app_settings where key = 'assistant_personality'",
    );
    const personality = personalityResult.rows[0]?.value ?? "Direto e prestativo.";

    const historyResult = await pool.query(
      "select role, content from assistant_memory order by created_at desc limit $1",
      [HISTORY_LIMIT],
    );
    const history: ChatMessage[] = historyResult.rows.reverse().map((r) => ({ role: r.role, content: r.content }));

    const context = await buildContext(message);

    const systemPrompt = `Você é o assistente pessoal e amigo de um estudante de Odontologia — não um chatbot de suporte. Você o acompanha todos os dias, conhece a rotina dele (pacientes, agenda, estoque, estudos, vida financeira) e conversa como alguém real conversaria: com naturalidade, interesse genuíno, podendo perguntar como ele está, comentar o dia, brincar quando fizer sentido. Personalidade configurada: ${personality}

Responda em português. Baseie qualquer fato ou número SOMENTE nos dados de contexto abaixo — se não souber algo, diga que não tem essa informação, nunca invente. Quando a resposta usar algo da Biblioteca Clínica dele (procedimentos, técnica, materiais, documentos), CITE a fonte entre colchetes exatamente como aparece no contexto (ex.: [Biblioteca › Dentística › Restauração Classe II]) — é o conhecimento dele, então deixe claro de onde veio. Mas o jeito de falar é livre: seja caloroso, direto ao ponto quando for sobre dados, e pessoal quando a conversa permitir. Nunca execute ações (criar, editar, apagar) sozinho: se o usuário pedir uma ação, descreva o que faria e peça confirmação explícita antes.

Contexto atual:
${context}`;

    const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: message }];

    try {
      const replyText = await chatCompletion(messages);

      await pool.query("insert into assistant_memory (role, content) values ($1, $2), ($3, $4)", [
        "user",
        message,
        "assistant",
        replyText,
      ]);

      return { reply: replyText };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : "Falha ao consultar o assistente." });
    }
  });
}
