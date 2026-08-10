import type { Drug, SafetyWarning } from "@app/core";

// Regras curadas (com fonte) de contraindicação em Odontologia. Roda no backend
// (rota de checagem do receituário). Espelha a lista de condições de
// packages/core/conditions.ts (CONDITION_FLAGS) usada na UI.
const ALLERGY_SYNONYMS: Record<string, string[]> = {
  penicilina: ["amoxicilina", "ampicilina", "penicilina"],
  aine: ["ibuprofeno", "nimesulida", "diclofenaco", "naproxeno", "cetoprofeno", "aspirina", "acido acetilsalicilico", "aas"],
  aspirina: ["aspirina", "aas", "acido acetilsalicilico"],
  dipirona: ["dipirona", "metamizol"],
  sulfa: ["sulfametoxazol", "sulfa"],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function checkPrescription(
  health: { allergies?: string[]; conditions?: string[] } | null,
  drug: Pick<Drug, "name" | "active_ingredient" | "category">,
): SafetyWarning[] {
  if (!health) return [];
  const warnings: SafetyWarning[] = [];
  const drugText = normalize(`${drug.name} ${drug.active_ingredient}`);
  const isNSAID = drug.category === "anti_inflamatorio";

  for (const allergyRaw of health.allergies ?? []) {
    const allergy = normalize(allergyRaw);
    if (allergy.length < 3) continue;
    const expansions = new Set<string>([allergy]);
    for (const [k, vs] of Object.entries(ALLERGY_SYNONYMS)) {
      if (k === allergy || vs.some((v) => normalize(v) === allergy)) {
        expansions.add(k);
        vs.forEach((v) => expansions.add(normalize(v)));
      }
    }
    if ([...expansions].some((e) => e.length >= 3 && drugText.includes(e))) {
      warnings.push({ level: "alta", text: `Paciente relata alergia a "${allergyRaw}" — este medicamento pode ser contraindicado.`, source: "Anamnese do paciente" });
    }
  }

  const has = (k: string) => (health.conditions ?? []).includes(k);
  if (isNSAID && has("anticoagulante")) warnings.push({ level: "alta", text: "AINE + anticoagulante: risco aumentado de sangramento. Prefira paracetamol/dipirona.", source: "Protocolos de manejo" });
  if (isNSAID && has("gestante")) warnings.push({ level: "alta", text: "AINE em gestante (esp. 3º trimestre): evite. Prefira paracetamol.", source: "FDA/ANVISA" });
  if (isNSAID && has("renal")) warnings.push({ level: "media", text: "AINE em insuficiência renal: nefrotóxico — evite ou ajuste a dose.", source: "—" });
  if (isNSAID && has("hipertensao")) warnings.push({ level: "media", text: "AINE pode elevar a PA e reduzir efeito de anti-hipertensivos.", source: "—" });
  if (normalize(drug.name).includes("tetraciclina") && has("gestante")) warnings.push({ level: "alta", text: "Tetraciclina é contraindicada na gestação (alteração da dentição fetal).", source: "FDA" });
  if (drug.category === "anestesico" && (has("hipertensao") || has("cardiopatia_profilaxia"))) warnings.push({ level: "media", text: "Anestésico com vasoconstritor: use com cautela e dose mínima; afira a PA.", source: "—" });
  if (drug.category === "antibiotico" && has("cardiopatia_profilaxia")) warnings.push({ level: "media", text: "Paciente requer profilaxia de endocardite — confirme o esquema (ex.: amoxicilina 2 g VO 1 h antes).", source: "AHA 2021" });

  return warnings;
}
