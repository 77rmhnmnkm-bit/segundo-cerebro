import type {
  AssistantMessage,
  AuthResponse,
  CalendarEvent,
  EventCategory,
  EstoqueContagens,
  EstoqueFiltros,
  EstoqueHistorico,
  EstoqueLocal,
  EstoqueLote,
  EstoqueProduto,
  MotivoDescarte,
  InboxNote,
  InventoryDomain,
  InventoryItem,
  InventoryMovement,
  InventoryUsageDay,
  ClinicalCase,
  ClinicalProcedure,
  SpecialtyDocument,
  ClinicalSpecialty,
  DentalUpdate,
  Habit,
  KnowledgeNote,
  SterilizationCycle,
  BiologicalIndicatorTest,
  SterilizationStatus,
  PatientHealth,
  SafetyWarning,
  DoseCalculation,
  Drug,
  DrugCategory,
  FinanceSummary,
  FinanceDomain,
  Expense,
  BudgetBucket,
  BudgetSummary,
  SavingsGoal,
  PersonalFinancePrinciple,
  CashflowMonth,
  PatientAuditLogEntry,
  InstructionTemplate,
  InstructionType,
  Prescription,
  FormResponse,
  FormResponseValue,
  FormTemplate,
  FormTemplateField,
  MedicalRecord,
  MovementType,
  OdontogramEntry,
  Patient,
  PatientFile,
  FileAnnotation,
  Payment,
  RecallSchedule,
  TreatmentPlan,
  TreatmentPlanStep,
  WishlistItem,
  WishlistPriority,
} from "@app/core";

export const API_URL = "http://localhost:4000";
const TOKEN_KEY = "sc_token";

// "Manter conectado" decides where the token lives: localStorage survives
// closing the browser (persistent login), sessionStorage is wiped when the
// tab/window closes (logs out next time). Both are checked on read.
export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string, rememberMe = true) {
  if (rememberMe) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      // Fastify rejects application/json with an empty body (400
      // FST_ERR_CTP_EMPTY_JSON_BODY), so only send this header when there's
      // actually a body to match — bodiless POSTs (logout, dev-bypass) stay fine.
      // FormData bodies (file uploads) must NOT get this header — the browser
      // sets its own multipart/form-data boundary automatically.
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Erro ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export function setupStatus() {
  return request<{ needsSetup: boolean }>("/auth/setup-status");
}

export function login(email: string, password: string, rememberMe: boolean) {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, rememberMe }),
  });
}

export function devBypassLogin() {
  return request<AuthResponse>("/auth/dev-bypass", { method: "POST" });
}

export function setup(name: string, email: string, password: string, rememberMe: boolean) {
  return request<AuthResponse>("/auth/setup", {
    method: "POST",
    body: JSON.stringify({ name, email, password, rememberMe }),
  });
}

export function me() {
  return request<{ user: AuthResponse["user"] }>("/auth/me");
}

export function logout() {
  return request<void>("/auth/logout", { method: "POST" });
}

export function listInventoryItems(domain: InventoryDomain) {
  return request<{ items: InventoryItem[] }>(`/inventory/items?domain=${domain}`);
}

export function createInventoryItem(input: {
  domain: InventoryDomain;
  name: string;
  brand?: string;
  category?: string;
  batch?: string;
  manufacturedAt?: string;
  expiresAt?: string;
  location?: string;
  barcode?: string;
  photoUrl?: string;
  sourceLink?: string;
  quantity?: number;
  minQuantity?: number;
}) {
  return request<{ item: InventoryItem }>("/inventory/items", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function lookupProduct(url: string) {
  return request<{ product: { name: string | null; imageUrl: string | null; price: number | null; sourceUrl: string } }>(
    "/inventory/product-lookup",
    { method: "POST", body: JSON.stringify({ url }) },
  );
}

export function deleteInventoryItem(id: string) {
  return request<void>(`/inventory/items/${id}`, { method: "DELETE" });
}

export function createMovement(input: {
  itemId: string;
  type: MovementType;
  quantity: number;
  fromLocation?: string;
  toLocation?: string;
}) {
  return request<{ movement: InventoryMovement; belowMin: boolean }>("/inventory/movements", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listLowStock(domain?: InventoryDomain) {
  const qs = domain ? `?domain=${domain}` : "";
  return request<{ items: InventoryItem[] }>(`/inventory/low-stock${qs}`);
}

export function listWishlist(domain: InventoryDomain) {
  return request<{ items: WishlistItem[] }>(`/inventory/wishlist?domain=${domain}`);
}

export function createWishlistItem(input: {
  domain: InventoryDomain;
  name: string;
  description?: string;
  priority?: WishlistPriority;
  purchaseLink?: string;
  photoUrl?: string;
  price?: number;
}) {
  return request<{ item: WishlistItem }>("/inventory/wishlist", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteWishlistItem(id: string) {
  return request<void>(`/inventory/wishlist/${id}`, { method: "DELETE" });
}

export function listEvents(params: { from?: string; to?: string; category?: EventCategory } = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][],
  ).toString();
  return request<{ events: CalendarEvent[] }>(`/events${qs ? `?${qs}` : ""}`);
}

export function createEvent(input: {
  title: string;
  description?: string;
  category: EventCategory;
  patientId?: string;
  startAt: string;
  endAt?: string;
  locationText?: string;
  locationLat?: number;
  locationLng?: number;
  travelMinutes?: number;
  prepMinutes?: number;
  source?: "manual" | "ai_text" | "ai_photo";
  rawInput?: string;
}) {
  return request<{ event: CalendarEvent }>("/events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteEvent(id: string) {
  return request<void>(`/events/${id}`, { method: "DELETE" });
}

export function updateEventConfirmation(id: string, confirmationStatus: "pendente" | "confirmado" | "falta") {
  return request<{ event: CalendarEvent }>(`/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ confirmationStatus }),
  });
}

export interface EventDraftResponse {
  draft: {
    title: string;
    category: EventCategory;
    startAt: string;
    locationText?: string;
    description?: string;
  };
  rawInput: string;
}

export function extractEvent(text: string) {
  return request<EventDraftResponse>("/events/extract", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function extractEventFromFile(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request<EventDraftResponse>("/events/extract-file", {
    method: "POST",
    body: formData,
  });
}

export function listNotes() {
  return request<{ notes: InboxNote[] }>("/notes");
}

export function createNote(content: string) {
  return request<{ note: InboxNote }>("/notes", {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function setNoteDone(id: string, done: boolean) {
  return request<{ note: InboxNote }>(`/notes/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ done }),
  });
}

export function deleteNote(id: string) {
  return request<void>(`/notes/${id}`, { method: "DELETE" });
}

export function getInventoryUsageSummary(days = 14) {
  return request<{ days: InventoryUsageDay[] }>(`/inventory/usage-summary?days=${days}`);
}

export function listPatients(search?: string) {
  return request<{ patients: Patient[] }>(`/patients${search ? `?search=${encodeURIComponent(search)}` : ""}`);
}

export function getPatient(id: string) {
  return request<{ patient: Patient }>(`/patients/${id}`);
}

export function createPatient(input: {
  name: string;
  birthDate?: string;
  phone?: string;
  email?: string;
  cpf?: string;
  address?: string;
  notes?: string;
}) {
  return request<{ patient: Patient }>("/patients", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePatient(id: string, input: Partial<{
  name: string;
  birthDate: string;
  phone: string;
  email: string;
  cpf: string;
  address: string;
  notes: string;
}>) {
  return request<{ patient: Patient }>(`/patients/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deletePatient(id: string) {
  return request<void>(`/patients/${id}`, { method: "DELETE" });
}

export function listPatientFiles(patientId: string) {
  return request<{ files: PatientFile[] }>(`/patients/${patientId}/files`);
}

export function uploadPatientFile(patientId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request<{ file: PatientFile }>(`/patients/${patientId}/files`, {
    method: "POST",
    body: formData,
  });
}

export function deletePatientFile(fileId: string) {
  return request<void>(`/patients/files/${fileId}`, { method: "DELETE" });
}

export function saveFileAnnotations(fileId: string, annotations: FileAnnotation[]) {
  return request<{ file: PatientFile }>(`/patients/files/${fileId}/annotations`, {
    method: "PUT",
    body: JSON.stringify({ annotations }),
  });
}

export function aiDescribeFile(fileId: string) {
  return request<{ description: string }>(`/patients/files/${fileId}/ai-describe`, { method: "POST" });
}

export interface AiDetection {
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
  points?: { x: number; y: number }[];
  learnedRate?: number | null;
}

export interface DetectionLearning {
  totalDecisions: number;
  perLabel: Record<string, { confirm: number; reject: number; rate: number | null }>;
}

export function aiDetectFile(fileId: string, conf?: number) {
  return request<{ detections: AiDetection[]; learning?: DetectionLearning }>(`/patients/files/${fileId}/ai-detect`, {
    method: "POST",
    body: JSON.stringify({ conf }),
  });
}

export function updatePatientFile(fileId: string, input: { radiographType?: string | null; label?: string }) {
  return request<{ file: PatientFile }>(`/patients/files/${fileId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function recordDetectionFeedback(
  fileId: string,
  input: { label: string; action: "confirm" | "reject"; confidence?: number; x?: number; y?: number; w?: number; h?: number },
) {
  return request<{ ok: boolean }>(`/patients/files/${fileId}/detection-feedback`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listMedicalRecords(patientId: string) {
  return request<{ records: MedicalRecord[] }>(`/patients/${patientId}/records`);
}

export function createMedicalRecord(patientId: string, content: string, nextSteps?: string) {
  return request<{ record: MedicalRecord }>(`/patients/${patientId}/records`, {
    method: "POST",
    body: JSON.stringify({ content, nextSteps }),
  });
}

export function listOdontogram(patientId: string) {
  return request<{ entries: OdontogramEntry[] }>(`/patients/${patientId}/odontogram`);
}

export function createOdontogramEntry(
  patientId: string,
  input: { toothNumber: number; face?: string; procedureName: string; material?: string; status?: string },
) {
  return request<{ entry: OdontogramEntry }>(`/patients/${patientId}/odontogram`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteOdontogramEntry(entryId: string) {
  return request<void>(`/patients/odontogram/${entryId}`, { method: "DELETE" });
}

export function listFormTemplates() {
  return request<{ templates: FormTemplate[] }>("/form-templates");
}

export function getFormTemplate(id: string) {
  return request<{ template: FormTemplate; fields: FormTemplateField[] }>(`/form-templates/${id}`);
}

export function listFormResponses(patientId: string) {
  return request<{ responses: FormResponse[] }>(`/patients/${patientId}/form-responses`);
}

export function getFormResponse(id: string) {
  return request<{ response: FormResponse; values: FormResponseValue[] }>(`/form-responses/${id}`);
}

export function createFormResponse(patientId: string, templateId: string, values: { fieldId: string; value: unknown }[]) {
  return request<{ response: FormResponse }>(`/patients/${patientId}/form-responses`, {
    method: "POST",
    body: JSON.stringify({ templateId, values }),
  });
}

export function transcribeAudio(blob: Blob) {
  const formData = new FormData();
  formData.append("file", blob, "audio.webm");
  return request<{ text: string }>("/transcribe", {
    method: "POST",
    body: formData,
  });
}

export function listTreatmentPlans(patientId: string) {
  return request<{ plans: TreatmentPlan[] }>(`/patients/${patientId}/treatment-plans`);
}

export function createTreatmentPlan(patientId: string, title: string) {
  return request<{ plan: TreatmentPlan }>(`/patients/${patientId}/treatment-plans`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function updateTreatmentPlanStatus(planId: string, status: string) {
  return request<{ plan: TreatmentPlan }>(`/treatment-plans/${planId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function deleteTreatmentPlan(planId: string) {
  return request<void>(`/treatment-plans/${planId}`, { method: "DELETE" });
}

export function listTreatmentSteps(planId: string) {
  return request<{ steps: TreatmentPlanStep[] }>(`/treatment-plans/${planId}/steps`);
}

export function createTreatmentStep(
  planId: string,
  input: { description: string; procedureName?: string; value?: number },
) {
  return request<{ step: TreatmentPlanStep }>(`/treatment-plans/${planId}/steps`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTreatmentStepStatus(stepId: string, status: string) {
  return request<{ step: TreatmentPlanStep }>(`/treatment-plan-steps/${stepId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateTreatmentStep(
  stepId: string,
  input: Partial<{ status: string; description: string; procedureName: string; value: number | null }>,
) {
  return request<{ step: TreatmentPlanStep }>(`/treatment-plan-steps/${stepId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteTreatmentStep(stepId: string) {
  return request<void>(`/treatment-plan-steps/${stepId}`, { method: "DELETE" });
}

export function listPayments(planId: string) {
  return request<{ payments: Payment[] }>(`/treatment-plans/${planId}/payments`);
}

export function createPayment(
  planId: string,
  input: { amount: number; stepId?: string; paidAt?: string; method?: string; notes?: string },
) {
  return request<{ payment: Payment }>(`/treatment-plans/${planId}/payments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deletePayment(paymentId: string) {
  return request<void>(`/payments/${paymentId}`, { method: "DELETE" });
}

export function getFinanceSummary(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return request<FinanceSummary>(`/finance/summary${qs}`);
}

export function listAllPayments(limit?: number) {
  return request<{ payments: Payment[] }>(`/finance/payments${limit ? `?limit=${limit}` : ""}`);
}

export function listExpenses(domain: FinanceDomain) {
  return request<{ expenses: Expense[] }>(`/finance/expenses?domain=${domain}`);
}

export function createExpense(input: {
  domain: FinanceDomain;
  category: string;
  description?: string;
  amount: number;
  paidAt?: string;
  recurring?: boolean;
  bucket?: BudgetBucket;
}) {
  return request<{ expense: Expense }>("/finance/expenses", { method: "POST", body: JSON.stringify(input) });
}

export function deleteExpense(id: string) {
  return request<void>(`/finance/expenses/${id}`, { method: "DELETE" });
}

export function getCashflow(domain: FinanceDomain, months = 6) {
  return request<{ months: CashflowMonth[] }>(`/finance/cashflow?domain=${domain}&months=${months}`);
}

export function listSavingsGoals() {
  return request<{ goals: SavingsGoal[] }>("/finance/savings-goals");
}

export function createSavingsGoal(input: { name: string; targetAmount: number; currentAmount?: number; targetDate?: string }) {
  return request<{ goal: SavingsGoal }>("/finance/savings-goals", { method: "POST", body: JSON.stringify(input) });
}

export function updateSavingsGoal(id: string, currentAmount: number) {
  return request<{ goal: SavingsGoal }>(`/finance/savings-goals/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ currentAmount }),
  });
}

export function deleteSavingsGoal(id: string) {
  return request<void>(`/finance/savings-goals/${id}`, { method: "DELETE" });
}

export function listFinancePrinciples() {
  return request<{ principles: PersonalFinancePrinciple[] }>("/finance/principles");
}

export function getBudgetSummary() {
  return request<BudgetSummary>("/finance/budget");
}

export function listRecalls(patientId: string) {
  return request<{ recalls: RecallSchedule[] }>(`/patients/${patientId}/recalls`);
}

export function createRecall(patientId: string, input: { recallType: string; dueDate: string }) {
  return request<{ recall: RecallSchedule }>(`/patients/${patientId}/recalls`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function setRecallCompleted(recallId: string, completed: boolean) {
  return request<{ recall: RecallSchedule }>(`/recalls/${recallId}`, {
    method: "PATCH",
    body: JSON.stringify({ completed }),
  });
}

export function deleteRecall(recallId: string) {
  return request<void>(`/recalls/${recallId}`, { method: "DELETE" });
}

export function listUpcomingRecalls(days = 30) {
  return request<{ recalls: RecallSchedule[] }>(`/recalls/upcoming?days=${days}`);
}

export function listSpecialties() {
  return request<{ specialties: ClinicalSpecialty[] }>("/clinical-specialties");
}

export function createSpecialty(name: string) {
  return request<{ specialty: ClinicalSpecialty }>("/clinical-specialties", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function listProcedures(specialtyId: string) {
  return request<{ procedures: ClinicalProcedure[] }>(`/clinical-specialties/${specialtyId}/procedures`);
}

export function createProcedure(
  specialtyId: string,
  input: { name: string; materials?: string; techniqueScript?: string },
) {
  return request<{ procedure: ClinicalProcedure }>(`/clinical-specialties/${specialtyId}/procedures`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listSpecialtyDocuments(specialtyId: string) {
  return request<{ documents: SpecialtyDocument[] }>(`/clinical-specialties/${specialtyId}/documents`);
}

export function getSpecialtyDocument(docId: string) {
  return request<{ document: SpecialtyDocument }>(`/specialty-documents/${docId}`);
}

export function uploadSpecialtyDocument(specialtyId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request<{ document: SpecialtyDocument }>(`/clinical-specialties/${specialtyId}/documents`, {
    method: "POST",
    body: formData,
  });
}

export function deleteSpecialtyDocument(docId: string) {
  return request<void>(`/specialty-documents/${docId}`, { method: "DELETE" });
}

export function deleteProcedure(procedureId: string) {
  return request<void>(`/procedures/${procedureId}`, { method: "DELETE" });
}

export function listDrugs(category?: DrugCategory) {
  return request<{ drugs: Drug[] }>(`/drugs${category ? `?category=${category}` : ""}`);
}

export function listInstructionTemplates(type?: InstructionType) {
  return request<{ templates: InstructionTemplate[] }>(`/instruction-templates${type ? `?type=${type}` : ""}`);
}

export function listPrescriptions(patientId: string) {
  return request<{ prescriptions: Prescription[] }>(`/patients/${patientId}/prescriptions`);
}

export function createPrescription(
  patientId: string,
  input: { drugId: string; dosageText: string; quantity?: string },
) {
  return request<{ prescription: Prescription }>(`/patients/${patientId}/prescriptions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listDoseCalculations(patientId: string) {
  return request<{ calculations: DoseCalculation[] }>(`/patients/${patientId}/dose-calculations`);
}

export function createDoseCalculation(
  patientId: string,
  input: { drugId: string; weightKg: number; isPediatric?: boolean; comorbidities?: string; maxDoseMg?: number; maxUnits?: number },
) {
  return request<{ calculation: DoseCalculation }>(`/patients/${patientId}/dose-calculations`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteDoseCalculation(calculationId: string) {
  return request<void>(`/dose-calculations/${calculationId}`, { method: "DELETE" });
}

export function deletePrescription(prescriptionId: string) {
  return request<void>(`/prescriptions/${prescriptionId}`, { method: "DELETE" });
}

export function deleteMedicalRecord(recordId: string) {
  return request<void>(`/patients/records/${recordId}`, { method: "DELETE" });
}

export function deleteFormResponse(responseId: string) {
  return request<void>(`/form-responses/${responseId}`, { method: "DELETE" });
}

export function listAuditLog(patientId: string) {
  return request<{ log: PatientAuditLogEntry[] }>(`/patients/${patientId}/audit-log`);
}

export function logAuditAction(patientId: string, input: { action: string; entityType: string; description: string }) {
  return request<{ ok: true }>(`/patients/${patientId}/audit-log`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listClinicalCases(patientId: string) {
  return request<{ cases: ClinicalCase[] }>(`/patients/${patientId}/clinical-cases`);
}

export function createClinicalCase(
  patientId: string,
  input: { title: string; description?: string; hours?: number; procedureId?: string; supervisorName?: string },
) {
  return request<{ case: ClinicalCase }>(`/patients/${patientId}/clinical-cases`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteClinicalCase(caseId: string) {
  return request<void>(`/clinical-cases/${caseId}`, { method: "DELETE" });
}

export function getSetting(key: string) {
  return request<{ setting: { key: string; value: unknown } }>(`/settings/${key}`);
}

export function putSetting(key: string, value: unknown) {
  return request<{ setting: { key: string; value: unknown } }>(`/settings/${key}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}

export function putBaseAddress(address: string) {
  return request<{ address: string; coords: { lat: number; lng: number; displayName: string } }>(
    "/settings/base-address",
    { method: "PUT", body: JSON.stringify({ address }) },
  );
}

export function listAssistantMemory() {
  return request<{ messages: AssistantMessage[] }>("/assistant/memory");
}

export function sendAssistantMessage(message: string) {
  return request<{ reply: string }>("/assistant/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function clearAssistantMemory() {
  return request<void>("/assistant/memory", { method: "DELETE" });
}

export function getNextEventBriefing() {
  return request<{ event: CalendarEvent | null; tip: string | null }>("/dashboard/next-event-briefing");
}

export function getProactiveTip() {
  return request<{ tip: string | null }>("/assistant/proactive-tip");
}

export function getPatientTip(patientId: string) {
  return request<{ tip: string | null }>(`/assistant/patient-tip/${patientId}`);
}

export function getModuleTip(module: string) {
  return request<{ tip: string | null }>(`/assistant/module-tip/${module}`);
}

export function listDentalUpdates(category?: string, evidence?: string) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (evidence) params.set("evidence", evidence);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return request<{ updates: DentalUpdate[] }>(`/dental-updates${qs}`);
}

export function refreshDentalUpdates() {
  return request<{ updates: DentalUpdate[]; added: number; errors: string[] }>("/dental-updates/refresh", {
    method: "POST",
  });
}

// #24 Hábitos
export function listHabits() {
  return request<{ habits: Habit[] }>("/habits");
}
export function createHabit(input: { name: string; rationale?: string; source?: string; cadence?: "daily" | "weekly"; targetPerWeek?: number }) {
  return request<{ habit: Habit }>("/habits", { method: "POST", body: JSON.stringify(input) });
}
export function toggleHabit(id: string, date?: string) {
  return request<{ done: boolean }>(`/habits/${id}/toggle`, { method: "POST", body: JSON.stringify({ date }) });
}
export function deleteHabit(id: string) {
  return request<void>(`/habits/${id}`, { method: "DELETE" });
}

// #26 PKM
export interface KnowledgeListItem {
  id: string;
  title: string;
  updated_at: string;
  snippet: string;
  link_count: number;
}
export function listKnowledge() {
  return request<{ notes: KnowledgeListItem[] }>("/knowledge");
}
export function getKnowledgeNote(id: string) {
  return request<{ note: KnowledgeNote }>(`/knowledge/${id}`);
}
export function createKnowledgeNote(input: { title: string; body?: string }) {
  return request<{ note: KnowledgeNote }>("/knowledge", { method: "POST", body: JSON.stringify(input) });
}
export function updateKnowledgeNote(id: string, input: { title?: string; body?: string }) {
  return request<{ note: KnowledgeNote }>(`/knowledge/${id}`, { method: "PUT", body: JSON.stringify(input) });
}
export function deleteKnowledgeNote(id: string) {
  return request<void>(`/knowledge/${id}`, { method: "DELETE" });
}

// #22 Export de treino
export function exportTrainingDataset() {
  return request<{ imageCount: number; labelCount: number; byClass: Record<string, number>; path?: string; message?: string }>(
    "/ai/training-export",
    { method: "POST" },
  );
}

// Esterilização (RDC 1.002/2025)
export function listSterilizationCycles() {
  return request<{ cycles: SterilizationCycle[] }>("/sterilization/cycles");
}
export function createSterilizationCycle(input: {
  autoclave: string;
  cycleNumber?: string;
  lotNumber?: string;
  materialType?: string;
  operator: string;
  sterilizedAt?: string;
  chemicalIndicator?: "ok" | "fail" | "na";
  biologicalIndicator?: "na" | "pending" | "pass" | "fail";
  hasImplant?: boolean;
  notes?: string;
}) {
  return request<{ cycle: SterilizationCycle }>("/sterilization/cycles", { method: "POST", body: JSON.stringify(input) });
}
export function deleteSterilizationCycle(id: string) {
  return request<void>(`/sterilization/cycles/${id}`, { method: "DELETE" });
}
export function listBiTests() {
  return request<{ tests: BiologicalIndicatorTest[] }>("/sterilization/bi");
}
export function createBiTest(input: { autoclave: string; testedAt?: string; lotNumber?: string; result?: "pending" | "pass" | "fail"; notes?: string }) {
  return request<{ test: BiologicalIndicatorTest }>("/sterilization/bi", { method: "POST", body: JSON.stringify(input) });
}
export function getSterilizationStatus() {
  return request<SterilizationStatus>("/sterilization/status");
}

// Segurança do paciente
export function getPatientHealth(patientId: string) {
  return request<{ health: PatientHealth }>(`/patients/${patientId}/health`);
}
export function updatePatientHealth(patientId: string, input: { allergies?: string[]; medications?: string[]; conditions?: string[]; notes?: string }) {
  return request<{ health: PatientHealth }>(`/patients/${patientId}/health`, { method: "PUT", body: JSON.stringify(input) });
}
export function checkPrescriptionSafety(patientId: string, drugId: string) {
  return request<{ warnings: SafetyWarning[] }>(`/patients/${patientId}/prescription-check`, { method: "POST", body: JSON.stringify({ drugId }) });
}

// Estoque (Clínica Escola)
export function getEstoqueContagens() {
  return request<EstoqueContagens>("/estoque/contagens");
}

export function getEstoqueLotes(params: {
  visao?: string;
  especialidade?: string;
  local?: string;
  busca?: string;
  conferencia?: boolean;
  vencidos?: boolean;
  soFalta?: boolean;
  soAberto?: boolean;
  limite?: number;
  desde?: number;
}) {
  const q = new URLSearchParams();
  if (params.visao) q.set("visao", params.visao);
  if (params.especialidade) q.set("especialidade", params.especialidade);
  if (params.local) q.set("local", params.local);
  if (params.busca) q.set("busca", params.busca);
  if (params.conferencia) q.set("conferencia", "1");
  if (params.vencidos) q.set("vencidos", "1");
  if (params.soFalta) q.set("flag", "1");
  if (params.soAberto) q.set("aberto", "1");
  if (params.limite) q.set("limite", String(params.limite));
  if (params.desde) q.set("desde", String(params.desde));
  return request<{ lotes: EstoqueLote[]; total: number }>(`/estoque/lotes?${q}`);
}

export function getEstoqueComprar() {
  return request<{ produtos: EstoqueProduto[] }>("/estoque/comprar");
}

export function getEstoqueFiltros() {
  return request<EstoqueFiltros>("/estoque/filtros");
}

export function getEstoqueLocais() {
  return request<{ locais: EstoqueLocal[] }>("/estoque/locais");
}

export function patchEstoqueLote(
  id: string,
  body: {
    localId?: string | null;
    validade?: string | null;
    semValidadeImpressa?: boolean;
    quantidade?: number;
    observacoes?: string | null;
    situacao?: string | null;
    resolverMotivos?: string[];
  },
) {
  return request<{ lote: EstoqueLote }>(`/estoque/lotes/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function descartarEstoqueLote(id: string, motivo: MotivoDescarte) {
  return request<{ lote: EstoqueLote }>(`/estoque/lotes/${id}/descartar`, {
    method: "POST",
    body: JSON.stringify({ motivo }),
  });
}

export function movimentarEstoqueLote(id: string, tipo: "entrada" | "saida", quantidade: number, motivo?: string) {
  return request<{ lote: EstoqueLote }>(`/estoque/lotes/${id}/movimento`, {
    method: "POST",
    body: JSON.stringify({ tipo, quantidade, motivo }),
  });
}

export function getEstoqueLoteHistorico(id: string) {
  return request<EstoqueHistorico>(`/estoque/lotes/${id}/historico`);
}
