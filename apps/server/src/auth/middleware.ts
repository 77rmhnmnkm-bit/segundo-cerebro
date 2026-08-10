import type { FastifyReply, FastifyRequest } from "fastify";
import { getUserBySessionToken } from "./session.js";

export function extractToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const token = extractToken(req.headers.authorization);
  if (!token) {
    return reply.code(401).send({ error: "Não autenticado." });
  }

  const user = await getUserBySessionToken(token);
  if (!user) {
    return reply.code(401).send({ error: "Sessão inválida ou expirada." });
  }

  req.user = user;
}
