import { pool } from "./db/pool.js";

export async function logPatientAction(patientId: string, action: string, entityType: string, description: string) {
  await pool.query(
    "insert into patient_audit_log (patient_id, action, entity_type, description) values ($1, $2, $3, $4)",
    [patientId, action, entityType, description],
  );
}
