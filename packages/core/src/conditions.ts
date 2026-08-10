// Segurança do paciente: perfil de saúde + regras curadas (com fonte) de
// contraindicação. NÃO é um banco genérico de interações de LLM — é uma lista
// curada do que importa em Odontologia, sempre citando a origem. O profissional
// confirma; o sistema só alerta.

export interface PatientHealth {
  patient_id: string;
  allergies: string[];
  medications: string[];
  conditions: string[]; // chaves de CONDITION_FLAGS
  notes: string | null;
  updated_at: string;
}

export type Severity = "alta" | "media";

export interface ConditionFlag {
  key: string;
  label: string;
  severity: Severity;
  implication: string;
  source: string;
}

export const CONDITION_FLAGS: ConditionFlag[] = [
  { key: "anticoagulante", label: "Uso de anticoagulante", severity: "alta", implication: "Risco de sangramento em procedimentos cirúrgicos. Evite AINEs; avalie INR e conduta antes de exodontia.", source: "Protocolos de manejo perioperatório" },
  { key: "bisfosfonato", label: "Bifosfonato / antirreabsortivo", severity: "alta", implication: "Risco de osteonecrose dos maxilares (MRONJ) em exodontia/implante. Avalie risco antes de cirurgia.", source: "AAOMS Position Paper 2022" },
  { key: "gestante", label: "Gestante", severity: "alta", implication: "Evite AINEs (esp. 3º trimestre), tetraciclinas e sedação. Prefira paracetamol e amoxicilina; radiografia só se essencial, com proteção.", source: "FDA/ANVISA — categorias de risco" },
  { key: "cardiopatia_profilaxia", label: "Cardiopatia de risco (profilaxia)", severity: "alta", implication: "Profilaxia antibiótica antes de procedimentos com sangramento/manipulação gengival (válvula protética, endocardite prévia, cardiopatia congênita).", source: "AHA 2021 / SBC" },
  { key: "alergia_latex", label: "Alergia a látex", severity: "alta", implication: "Use materiais sem látex (luvas, lençol de borracha, elásticos).", source: "Anamnese" },
  { key: "diabetes", label: "Diabetes", severity: "media", implication: "Maior risco de infecção e cicatrização lenta. Verifique controle glicêmico; atenção à hipoglicemia.", source: "—" },
  { key: "hipertensao", label: "Hipertensão", severity: "media", implication: "Cautela com anestésico com vasoconstritor; afira a PA antes do atendimento.", source: "—" },
  { key: "renal", label: "Insuficiência renal", severity: "media", implication: "Ajuste de dose; evite AINEs (nefrotóxicos).", source: "—" },
  { key: "hepatopatia", label: "Hepatopatia", severity: "media", implication: "Cautela com paracetamol (dose) e metabolização de fármacos.", source: "—" },
  { key: "imunossupressao", label: "Imunossupressão", severity: "media", implication: "Maior risco de infecção; avalie profilaxia conforme o caso.", source: "—" },
];

export interface SafetyWarning {
  level: Severity;
  text: string;
  source?: string;
}
