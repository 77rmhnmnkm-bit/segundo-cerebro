import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      name: string;
      email: string;
      role: string;
      created_at: string;
    };
  }
}
