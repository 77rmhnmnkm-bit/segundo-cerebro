import { pool } from "../db/pool.js";

// "Lite RAG": instead of giving the model real tool-calling (unreliable on a
// 7B local model), we just always hand it today's operational picture, plus
// a best-effort keyword match against patient/item names mentioned in the
// message. Good enough for "o que tenho hoje" / "quanto tenho de luva M" /
// "quando atendi a Maria" style questions without needing an agent loop.
export async function buildContext(userMessage: string): Promise<string> {
  const sections: string[] = [];

  const today = await pool.query(
    `select title, category, start_at, location_text from events
     where start_at::date = current_date order by start_at`,
  );
  if (today.rowCount) {
    sections.push(
      "Compromissos de hoje:\n" +
        today.rows
          .map((e) => `- ${new Date(e.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} ${e.title} (${e.category})${e.location_text ? ` em ${e.location_text}` : ""}`)
          .join("\n"),
    );
  }

  const lowStock = await pool.query(
    "select name, quantity, min_quantity, location from inventory_items where min_quantity is not null and quantity <= min_quantity",
  );
  if (lowStock.rowCount) {
    sections.push(
      "Itens em estoque baixo:\n" +
        lowStock.rows.map((i) => `- ${i.name}: ${i.quantity} (mínimo ${i.min_quantity}) em ${i.location ?? "local não informado"}`).join("\n"),
    );
  }

  // Estoque da Clínica Escola (est_lotes/est_produtos) — módulo separado do
  // estoque pessoal/trabalho acima. Antes o assistente não via nada disso;
  // agora entra o resumo urgente sempre, e o produto citado por nome quando
  // a pergunta menciona um (mesmo padrão de keyword match usado abaixo para
  // inventory_items pessoal).
  const estoqueClinica = await pool.query(`
    select
      count(*) filter (where l.ativo and l.validade is not null and l.validade < current_date) as vencidos_com_estoque,
      count(*) filter (where l.precisa_conferencia) as conferencia
    from est_lotes l`);
  const ec = estoqueClinica.rows[0];
  if (Number(ec.vencidos_com_estoque) > 0 || Number(ec.conferencia) > 0) {
    sections.push(
      `Estoque da Clínica Escola: ${ec.vencidos_com_estoque} lote(s) vencido(s) ainda com saldo físico, ${ec.conferencia} lote(s) aguardando conferência (tela /estoque).`,
    );
  }
  const produtosClinica = await pool.query(`
    select p.nome, p.marca, coalesce(sum(l.quantidade), 0) as saldo, count(l.id) filter (where l.ativo) as lotes
    from est_produtos p left join est_lotes l on l.produto_id = p.id
    group by p.id, p.nome, p.marca`);
  const mencionadosClinica = produtosClinica.rows.filter((p) => userMessage.toLowerCase().includes(p.nome.toLowerCase()));
  for (const p of mencionadosClinica.slice(0, 3)) {
    sections.push(
      `Estoque da Clínica Escola — "${p.nome}"${p.marca ? ` (${p.marca})` : ""}: ${Number(p.saldo)} unidades em ${p.lotes} lote(s) ativo(s).`,
    );
  }

  const notes = await pool.query("select content from inbox_items where done = false order by created_at desc limit 10");
  if (notes.rowCount) {
    sections.push("Notas pendentes:\n" + notes.rows.map((n) => `- ${n.content}`).join("\n"));
  }

  const recalls = await pool.query(
    `select r.recall_type, r.due_date, p.name as patient_name from recall_schedules r
     join patients p on p.id = r.patient_id
     where r.completed = false and r.due_date <= current_date + interval '7 days' order by r.due_date`,
  );
  if (recalls.rowCount) {
    sections.push(
      "Retornos próximos (7 dias):\n" +
        recalls.rows.map((r) => `- ${r.patient_name}: ${r.recall_type} em ${new Date(r.due_date).toLocaleDateString("pt-BR")}`).join("\n"),
    );
  }

  // Keyword match: does the message mention a known patient or inventory item by name?
  const patients = await pool.query("select id, name from patients");
  const mentionedPatients = patients.rows.filter((p) => userMessage.toLowerCase().includes(p.name.toLowerCase().split(" ")[0]));
  for (const patient of mentionedPatients.slice(0, 2)) {
    const records = await pool.query(
      "select content, created_at from medical_records where patient_id = $1 order by created_at desc limit 3",
      [patient.id],
    );
    if (records.rowCount) {
      sections.push(
        `Últimas evoluções de ${patient.name}:\n` +
          records.rows.map((r) => `- ${new Date(r.created_at).toLocaleDateString("pt-BR")}: ${r.content}`).join("\n"),
      );
    }
  }

  const items = await pool.query("select name, quantity, location, domain from inventory_items");
  const mentionedItems = items.rows.filter((i) => userMessage.toLowerCase().includes(i.name.toLowerCase()));
  for (const item of mentionedItems.slice(0, 3)) {
    sections.push(`Estoque de "${item.name}" (${item.domain}): ${item.quantity} unidades em ${item.location ?? "local não informado"}.`);
  }

  // RAG sobre a base de conhecimento DELE: busca textual (FTS português) na
  // biblioteca clínica (procedimentos + técnica + materiais) e nos documentos
  // de especialidade enviados. Responde "qual material usei", "meu protocolo
  // de adesivo" com a fonte citada — sem inventar.
  const knowledge = await retrieveKnowledge(userMessage);
  if (knowledge) sections.push(knowledge);

  const financeSummary = await pool.query(
    `select coalesce(sum(amount), 0) as received from payments where date_trunc('month', paid_at) = date_trunc('month', current_date)`,
  );
  const financePending = await pool.query(
    `select coalesce(sum(s.value), 0) as pending, count(*) as count from treatment_plan_steps s
     where s.status != 'concluido' and s.value is not null and not exists (select 1 from payments p where p.step_id = s.id)`,
  );
  const expiringSoon = await pool.query(
    "select name, expires_at from inventory_items where expires_at is not null and expires_at <= current_date + interval '30 days' order by expires_at limit 5",
  );
  sections.push(
    `Financeiro: recebido este mês R$ ${Number(financeSummary.rows[0].received).toFixed(2)}; pendente a receber R$ ${Number(financePending.rows[0].pending).toFixed(2)} (${financePending.rows[0].count} etapas).`,
  );
  if (expiringSoon.rowCount) {
    sections.push(
      "Itens vencendo em até 30 dias:\n" +
        expiringSoon.rows.map((i) => `- ${i.name}: vence em ${new Date(i.expires_at).toLocaleDateString("pt-BR")}`).join("\n"),
    );
  }

  return sections.length ? sections.join("\n\n") : "Nenhum dado relevante encontrado para o contexto atual.";
}

// Recuperação (RAG) na base de conhecimento clínico do próprio usuário.
// Usa full-text search em português; devolve trechos com a FONTE citada para
// o modelo poder responder "segundo seu protocolo de X..." sem inventar.
export async function retrieveKnowledge(userMessage: string): Promise<string | null> {
  const raw = userMessage.trim();
  if (raw.length < 4) return null;
  // RAG deve ser tolerante: transforma a pergunta em OR dos termos relevantes
  // (não AND), senão uma palavra ausente no documento zera o resultado. O
  // websearch_to_tsquery aceita "termo1 OR termo2" e ignora stopwords/pontuação.
  const terms = [
    ...new Set(
      raw
        .toLowerCase()
        .replace(/[^\p{L}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3),
    ),
  ].slice(0, 12);
  if (terms.length === 0) return null;
  const q = terms.join(" OR ");
  const sections: string[] = [];

  try {
    const procs = await pool.query(
      `select cs.name as specialty, p.name as procedure, p.materials, p.technique_script,
              ts_rank(
                to_tsvector('portuguese', coalesce(p.name,'') || ' ' || coalesce(p.materials,'') || ' ' || coalesce(p.technique_script,'')),
                websearch_to_tsquery('portuguese', $1)
              ) as rank
       from procedures p
       join clinical_specialties cs on cs.id = p.specialty_id
       where to_tsvector('portuguese', coalesce(p.name,'') || ' ' || coalesce(p.materials,'') || ' ' || coalesce(p.technique_script,''))
             @@ websearch_to_tsquery('portuguese', $1)
       order by rank desc limit 3`,
      [q],
    );
    for (const r of procs.rows) {
      const parts = [`[Biblioteca › ${r.specialty} › ${r.procedure}]`];
      if (r.materials) parts.push(`Materiais: ${r.materials}`);
      if (r.technique_script) parts.push(`Técnica: ${r.technique_script}`);
      sections.push(parts.join("\n"));
    }
  } catch {
    /* FTS pode falhar se a config 'portuguese' faltar — ignora silenciosamente */
  }

  try {
    const docs = await pool.query(
      `select cs.name as specialty, d.title, d.extracted_text,
              ts_rank(to_tsvector('portuguese', coalesce(d.title,'') || ' ' || coalesce(d.extracted_text,'')), websearch_to_tsquery('portuguese', $1)) as rank
       from specialty_documents d
       join clinical_specialties cs on cs.id = d.specialty_id
       where to_tsvector('portuguese', coalesce(d.title,'') || ' ' || coalesce(d.extracted_text,'')) @@ websearch_to_tsquery('portuguese', $1)
       order by rank desc limit 2`,
      [q],
    );
    for (const r of docs.rows) {
      const snippet = (r.extracted_text as string).slice(0, 600);
      sections.push(`[Documento › ${r.specialty} › ${r.title}]\n${snippet}${r.extracted_text.length > 600 ? "…" : ""}`);
    }
  } catch {
    /* idem */
  }

  if (!sections.length) return null;
  return "Da sua Biblioteca Clínica (cite a fonte entre colchetes ao usar):\n\n" + sections.join("\n\n");
}

// Patient-scoped context for the assistant's autonomous "você está há um
// tempo nessa ficha" remark — pulls real data about THIS specific patient
// (not the generic daily picture) so the comment can reference something
// concrete instead of being a canned joke.
export async function buildPatientContext(patientId: string): Promise<string> {
  const sections: string[] = [];

  const patient = await pool.query("select name, birth_date, notes from patients where id = $1", [patientId]);
  if (patient.rowCount === 0) return "Paciente não encontrado.";
  const p = patient.rows[0];
  sections.push(`Paciente: ${p.name}${p.notes ? ` — Observações: ${p.notes}` : ""}`);

  const records = await pool.query(
    "select content, next_steps, created_at from medical_records where patient_id = $1 order by created_at desc limit 5",
    [patientId],
  );
  if (records.rowCount) {
    sections.push(
      "Evolução recente:\n" +
        records.rows.map((r) => `- ${new Date(r.created_at).toLocaleDateString("pt-BR")}: ${r.content}${r.next_steps ? ` (próximo: ${r.next_steps})` : ""}`).join("\n"),
    );
  }

  const odontogram = await pool.query(
    "select tooth_number, face, status, procedure_name from odontogram_entries where patient_id = $1 order by tooth_number",
    [patientId],
  );
  if (odontogram.rowCount) {
    sections.push(
      `Odontograma (${odontogram.rowCount} registros):\n` +
        odontogram.rows.map((e) => `- Dente ${e.tooth_number}${e.face ? ` (${e.face})` : ""}: ${e.status} — ${e.procedure_name}`).join("\n"),
    );
  }

  const forms = await pool.query(
    `select t.name as template_name, r.created_at from form_responses r
     join form_templates t on t.id = r.template_id
     where r.patient_id = $1 order by r.created_at desc limit 5`,
    [patientId],
  );
  if (forms.rowCount) {
    sections.push("Formulários preenchidos:\n" + forms.rows.map((f) => `- ${f.template_name} (${new Date(f.created_at).toLocaleDateString("pt-BR")})`).join("\n"));
  }

  const steps = await pool.query(
    `select s.description, s.status from treatment_plan_steps s
     join treatment_plans tp on tp.id = s.plan_id
     where tp.patient_id = $1 order by s.order_index`,
    [patientId],
  );
  if (steps.rowCount) {
    sections.push("Plano de tratamento:\n" + steps.rows.map((s) => `- ${s.description} (${s.status})`).join("\n"));
  }

  return sections.length ? sections.join("\n\n") : `Paciente ${p.name} ainda sem dados registrados.`;
}
