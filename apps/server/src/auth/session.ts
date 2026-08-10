import { randomBytes } from "node:crypto";
import { pool } from "../db/pool.js";

const SHORT_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours — used when "manter conectado" is off
const LONG_SESSION_MS = 365 * 24 * 60 * 60 * 1000; // 1 year — used when "manter conectado" is on

export async function createSession(
  userId: string,
  opts: { rememberMe?: boolean } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + (opts.rememberMe ? LONG_SESSION_MS : SHORT_SESSION_MS));

  await pool.query(
    "insert into sessions (user_id, token, expires_at) values ($1, $2, $3)",
    [userId, token, expiresAt],
  );

  return { token, expiresAt };
}

export async function getUserBySessionToken(token: string) {
  const result = await pool.query(
    `select u.id, u.name, u.email, u.role, u.created_at
     from sessions s
     join users u on u.id = s.user_id
     where s.token = $1 and s.expires_at > now()`,
    [token],
  );
  return result.rows[0] ?? null;
}

export async function deleteSession(token: string) {
  await pool.query("delete from sessions where token = $1", [token]);
}
