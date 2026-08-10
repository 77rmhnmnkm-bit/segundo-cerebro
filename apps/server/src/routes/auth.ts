import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { createSession, deleteSession, getUserBySessionToken } from "../auth/session.js";
import { extractToken } from "../auth/middleware.js";

export async function authRoutes(app: FastifyInstance) {
  app.get("/auth/setup-status", async () => {
    const existing = await pool.query("select id from users limit 1");
    return { needsSetup: !existing.rowCount || existing.rowCount === 0 };
  });

  // First-run setup: only works while there are no users yet. This is the
  // only way an account can ever be created — there is no public sign-up;
  // any future teammate accounts get created by the owner from inside the
  // authenticated app, not from this externally-reachable flow.
  app.post("/auth/setup", async (req, reply) => {
    const { name, email, password, rememberMe } = req.body as {
      name: string;
      email: string;
      password: string;
      rememberMe?: boolean;
    };

    const existing = await pool.query("select id from users limit 1");
    if (existing.rowCount && existing.rowCount > 0) {
      return reply.code(409).send({ error: "Setup already completed." });
    }

    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `insert into users (name, email, password_hash, role)
       values ($1, $2, $3, 'owner')
       returning id, name, email, role, created_at`,
      [name, email, passwordHash],
    );

    const user = result.rows[0];
    const { token } = await createSession(user.id, { rememberMe });
    return { user, token };
  });

  app.post("/auth/login", async (req, reply) => {
    const { email, password, rememberMe } = req.body as {
      email: string;
      password: string;
      rememberMe?: boolean;
    };

    const result = await pool.query(
      "select id, name, email, role, created_at, password_hash from users where email = $1",
      [email],
    );
    const user = result.rows[0];
    if (!user) {
      return reply.code(401).send({ error: "Credenciais inválidas." });
    }

    const valid = await verifyPassword(user.password_hash, password);
    if (!valid) {
      return reply.code(401).send({ error: "Credenciais inválidas." });
    }

    const { token } = await createSession(user.id, { rememberMe });
    const { password_hash, ...publicUser } = user;
    return { user: publicUser, token };
  });

  // Dev-only convenience: auto-issues a real session for the existing owner
  // so the login screen can be skipped while iterating locally. Only does
  // anything when DEV_SKIP_AUTH=true is set on the server — unset that (or
  // just don't set it) to require real login again, with zero code changes.
  app.post("/auth/dev-bypass", async (req, reply) => {
    if (process.env.DEV_SKIP_AUTH !== "true") {
      return reply.code(404).send({ error: "Not available." });
    }

    const result = await pool.query("select id, name, email, role, created_at from users limit 1");
    const user = result.rows[0];
    if (!user) {
      return reply.code(404).send({ error: "Nenhuma conta configurada ainda." });
    }

    const { token } = await createSession(user.id, { rememberMe: true });
    return { user, token };
  });

  app.post("/auth/logout", async (req, reply) => {
    const token = extractToken(req.headers.authorization);
    if (token) await deleteSession(token);
    return reply.code(204).send();
  });

  app.get("/auth/me", async (req, reply) => {
    const token = extractToken(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "Não autenticado." });

    const user = await getUserBySessionToken(token);
    if (!user) return reply.code(401).send({ error: "Sessão inválida ou expirada." });

    return { user };
  });
}
