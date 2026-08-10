export type UserRole = "owner" | "staff";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export type InventoryDomain = "trabalho" | "pessoal";
export type MovementType = "entrada" | "saida" | "transferencia";
export type WishlistPriority = "baixa" | "normal" | "alta";

export interface InventoryItem {
  id: string;
  domain: InventoryDomain;
  name: string;
  brand: string | null;
  category: string | null;
  batch: string | null;
  manufactured_at: string | null;
  expires_at: string | null;
  location: string | null;
  barcode: string | null;
  photo_path: string | null;
  photo_url: string | null;
  source_link: string | null;
  quantity: string;
  min_quantity: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  item_id: string;
  type: MovementType;
  quantity: string;
  from_location: string | null;
  to_location: string | null;
  created_at: string;
}

export interface WishlistItem {
  id: string;
  domain: InventoryDomain;
  name: string;
  description: string | null;
  priority: WishlistPriority;
  purchase_link: string | null;
  photo_url: string | null;
  price: string | null;
  created_at: string;
}

export type EventCategory = "atendimento_paciente" | "pessoal" | "academico";
export type EventSource = "manual" | "ai_text" | "ai_photo";

export interface Patient {
  id: string;
  name: string;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type PatientFileFormat = "image" | "dicom" | "pdf";

export interface FileAnnotation {
  type: "rect" | "circle" | "arrow" | "text" | "stamp" | "freehand" | "measure";
  x: number;
  y: number;
  w?: number;
  h?: number;
  x2?: number;
  y2?: number;
  color: string;
  label?: string;
  // Para type "stamp" (planejamento visual ao paciente): qual tratamento
  // representar sobre o dente — implante, coroa, extração, etc.
  stamp?: "implante" | "coroa" | "extracao" | "protese" | "aparelho";
  scale?: number;
  // Para type "freehand" (contorno livre de anatomia — seio maxilar, canal
  // mandibular, etc., estilo DIO): pontos do traçado em coordenadas 0-1.
  points?: { x: number; y: number }[];
  // Origem do achado: "ia" = sugerido pela IA, "manual" = desenhado pelo
  // profissional. Usado para revisar/salvar no odontograma só o que ele confia.
  origin?: "ia" | "manual";
  // Achado de IA confirmado um-a-um pelo profissional (✓). Confirmar também
  // ensina a IA (registra feedback positivo daquela classe).
  confirmed?: boolean;
  // Traçado aberto (linha, ex.: nível ósseo) em vez de polígono fechado.
  openLine?: boolean;
  // Para type "measure" (régua): se for a linha de calibração, mm é o valor
  // real informado; pxPerMm é derivado dela e aplicado às demais medições.
  calibration?: boolean;
  mm?: number;
}

export type RadiographType = "panoramica" | "bitewing" | "periapical" | "foto";

export interface PatientFile {
  id: string;
  patient_id: string;
  file_path: string;
  format: PatientFileFormat;
  label: string | null;
  annotations: FileAnnotation[];
  ai_description: string | null;
  radiograph_type: RadiographType | null;
  created_at: string;
}

export interface MedicalRecord {
  id: string;
  patient_id: string;
  content: string;
  next_steps: string | null;
  audio_path: string | null;
  created_at: string;
}

export type ToothStatus = "saudavel" | "carie" | "restaurado" | "ausente" | "implante" | "endodontia";
export type ToothFace = "vestibular" | "lingual" | "mesial" | "distal" | "oclusal";

export interface OdontogramEntry {
  id: string;
  patient_id: string;
  tooth_number: number;
  face: string | null;
  procedure_name: string;
  material: string | null;
  status: ToothStatus;
  recorded_at: string;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  category: EventCategory;
  patient_id: string | null;
  start_at: string;
  end_at: string | null;
  location_text: string | null;
  location_lat: number | null;
  location_lng: number | null;
  travel_minutes: number | null;
  prep_minutes: number;
  notify_at: string | null;
  source: EventSource;
  raw_input: string | null;
  confirmation_status: "pendente" | "confirmado" | "falta" | null;
  patient_name?: string | null;
  patient_phone?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventDraft {
  title: string;
  category: EventCategory;
  startAt: string;
  locationText?: string;
  description?: string;
  locationLat?: number;
  locationLng?: number;
  travelMinutes?: number;
}

export interface InboxNote {
  id: string;
  content: string;
  source: "text" | "voice";
  status: "untriaged" | "triaged";
  done: boolean;
  created_at: string;
}

export interface InventoryUsageDay {
  date: string;
  entradas: string;
  saidas: string;
}

export type FormFieldType = "text" | "textarea" | "select" | "checkbox_group" | "date" | "number" | "table";

export interface FormTemplate {
  id: string;
  name: string;
  type: string;
  version: number;
  source: "manual" | "pdf";
  created_at: string;
}

export interface FormTemplateField {
  id: string;
  template_id: string;
  section: string | null;
  label: string;
  field_type: FormFieldType;
  options: string[] | { columns: string[] } | null;
  order_index: number;
}

export interface FormResponse {
  id: string;
  patient_id: string;
  template_id: string;
  template_version: number;
  template_name?: string;
  template_type?: string;
  created_at: string;
  updated_at: string;
}

export interface FormResponseValue {
  id: string;
  response_id: string;
  field_id: string;
  value: unknown;
  label: string;
  field_type: FormFieldType;
  section: string | null;
  order_index: number;
}

export type TreatmentPlanStatus = "ativo" | "concluido" | "cancelado";
export type TreatmentStepStatus = "pendente" | "aprovado" | "concluido";

export interface TreatmentPlan {
  id: string;
  patient_id: string;
  title: string;
  status: TreatmentPlanStatus;
  created_at: string;
  updated_at: string;
}

export interface TreatmentPlanStep {
  id: string;
  plan_id: string;
  description: string;
  procedure_name: string | null;
  value: string | null;
  status: TreatmentStepStatus;
  order_index: number;
  created_at: string;
}

export interface Payment {
  id: string;
  plan_id: string;
  step_id: string | null;
  amount: string;
  paid_at: string;
  method: string | null;
  notes: string | null;
  created_at: string;
  plan_title?: string;
  patient_id?: string;
  patient_name?: string;
}

export interface FinanceSummary {
  totalReceived: string;
  paymentsCount: number;
  totalPending: string;
  pendingCount: number;
}

export type FinanceDomain = "trabalho" | "pessoal";

export type BudgetBucket = "necessidade" | "desejo" | "poupanca";

export interface Expense {
  id: string;
  domain: FinanceDomain;
  category: string;
  description: string | null;
  amount: string;
  paid_at: string;
  recurring: boolean;
  bucket: BudgetBucket | null;
  created_at: string;
}

export interface BudgetSummary {
  monthlyIncome: number;
  target: { necessidade: number; desejo: number; poupanca: number };
  spent: { necessidade: number; desejo: number; poupanca: number; sem_categoria: number };
}

export interface SavingsGoal {
  id: string;
  name: string;
  target_amount: string;
  current_amount: string;
  target_date: string | null;
  created_at: string;
}

export interface PersonalFinancePrinciple {
  id: string;
  title: string;
  summary: string;
  source: string;
  source_date: string;
  created_at: string;
}

export interface CashflowMonth {
  month: string;
  income: number;
  expenses: number;
}

export interface RecallSchedule {
  id: string;
  patient_id: string;
  patient_name?: string;
  recall_type: string;
  due_date: string;
  completed: boolean;
  created_at: string;
}

export interface ClinicalSpecialty {
  id: string;
  name: string;
  created_at: string;
}

export interface ClinicalProcedure {
  id: string;
  specialty_id: string;
  name: string;
  materials: string | null;
  technique_script: string | null;
  created_at: string;
}

export interface SpecialtyDocument {
  id: string;
  specialty_id: string;
  title: string;
  extracted_text?: string;
  created_at: string;
}

export type DrugCategory = "anestesico" | "antibiotico" | "analgesico" | "anti_inflamatorio" | "ansiolitico" | "corticoide" | "outro";

export interface Drug {
  id: string;
  name: string;
  category: DrugCategory;
  active_ingredient: string;
  dose_description: string;
  max_dose_mg_kg: string | null;
  max_absolute_mg: string | null;
  default_concentration: string | null;
  standard_presentation: string | null;
  source: string;
  source_date: string;
  created_at: string;
}

export interface PatientAuditLogEntry {
  id: string;
  patient_id: string;
  action: string;
  entity_type: string;
  description: string;
  created_at: string;
}

export interface DoseCalculation {
  id: string;
  patient_id: string;
  drug_id: string;
  drug_name?: string;
  weight_kg: string;
  is_pediatric: boolean;
  comorbidities: string | null;
  max_dose_mg: string | null;
  max_units: string | null;
  created_at: string;
}

export interface Prescription {
  id: string;
  patient_id: string;
  drug_id: string;
  drug_name?: string;
  standard_presentation?: string | null;
  dosage_text: string;
  quantity: string | null;
  created_at: string;
}

export type InstructionType = "pre_operatorio" | "pos_operatorio";

export interface InstructionTemplate {
  id: string;
  type: InstructionType;
  title: string;
  body: string;
  created_at: string;
}

export interface ClinicalCase {
  id: string;
  patient_id: string;
  procedure_id: string | null;
  procedure_name?: string | null;
  title: string;
  description: string | null;
  hours: string | null;
  supervisor_name: string | null;
  created_at: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface SterilizationCycle {
  id: string;
  autoclave: string;
  cycle_number: string | null;
  lot_number: string;
  material_type: string | null;
  operator: string;
  sterilized_at: string;
  chemical_indicator: "ok" | "fail" | "na";
  biological_indicator: "na" | "pending" | "pass" | "fail";
  has_implant: boolean;
  notes: string | null;
  created_at: string;
}

export interface BiologicalIndicatorTest {
  id: string;
  autoclave: string;
  tested_at: string;
  lot_number: string | null;
  result: "pending" | "pass" | "fail";
  notes: string | null;
  created_at: string;
}

export interface SterilizationStatus {
  lastBiDate: string | null;
  lastBiResult: "pending" | "pass" | "fail" | null;
  biOverdue: boolean; // sem indicador biológico há mais de 7 dias (ou nunca)
  daysSinceBi: number | null;
  openFails: number; // BIs com falha + ciclos com integrador químico falho (recentes)
  cyclesThisWeek: number;
}

export interface Habit {
  id: string;
  name: string;
  rationale: string | null;
  source: string | null;
  cadence: "daily" | "weekly";
  target_per_week: number | null;
  active: boolean;
  created_at: string;
  // Calculados pela API:
  done_today?: boolean;
  streak?: number;
  done_last_7?: number;
  log_dates?: string[];
}

export interface KnowledgeNote {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  // Calculados pela API ao abrir uma nota:
  links?: { id: string; title: string }[]; // [[saídas]] que existem
  missing_links?: string[]; // [[títulos]] ainda sem nota
  backlinks?: { id: string; title: string }[]; // notas que apontam para esta
}

export type DentalUpdateCategory = "clinico" | "politico" | "outro" | "institucional";
export type DentalUpdateEvidence = "comprovado" | "novidade" | "indefinido";

export interface DentalUpdate {
  id: string;
  source_name: string;
  title: string;
  title_original: string | null;
  source_language: string;
  link: string;
  published_at: string | null;
  fetched_at: string;
  category: DentalUpdateCategory;
  evidence_level: DentalUpdateEvidence;
}
