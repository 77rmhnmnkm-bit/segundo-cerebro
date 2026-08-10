import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";
import { fetchProductInfo } from "../ai/productLookup.js";

type Domain = "trabalho" | "pessoal";

export async function inventoryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // Pulls real name/photo/price from a store's own product page (schema.org
  // JSON-LD or Open Graph tags) — never invented, and returns null if the
  // page has no usable markup so the user just fills it in by hand.
  app.post("/inventory/product-lookup", async (req, reply) => {
    const { url } = req.body as { url: string };
    if (!url?.trim()) return reply.code(400).send({ error: "url é obrigatório." });
    const info = await fetchProductInfo(url.trim());
    if (!info) return reply.code(422).send({ error: "Não consegui ler informações dessa página." });
    return { product: info };
  });

  app.get("/inventory/items", async (req) => {
    const { domain } = req.query as { domain?: Domain };
    const result = domain
      ? await pool.query("select * from inventory_items where domain = $1 order by name", [domain])
      : await pool.query("select * from inventory_items order by name");
    return { items: result.rows };
  });

  app.get("/inventory/items/by-barcode/:code", async (req, reply) => {
    const { code } = req.params as { code: string };
    const result = await pool.query("select * from inventory_items where barcode = $1", [code]);
    if (result.rowCount === 0) return reply.code(404).send({ error: "Item não encontrado para esse código." });
    return { item: result.rows[0] };
  });

  app.post("/inventory/items", async (req, reply) => {
    const body = req.body as {
      domain: Domain;
      name: string;
      brand?: string;
      category?: string;
      batch?: string;
      manufacturedAt?: string;
      expiresAt?: string;
      location?: string;
      barcode?: string;
      photoPath?: string;
      photoUrl?: string;
      sourceLink?: string;
      quantity?: number;
      minQuantity?: number;
    };

    if (!body.domain || !body.name) {
      return reply.code(400).send({ error: "domain e name são obrigatórios." });
    }

    const result = await pool.query(
      `insert into inventory_items
        (domain, name, brand, category, batch, manufactured_at, expires_at, location, barcode, photo_path, photo_url, source_link, quantity, min_quantity)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, coalesce($13, 0), $14)
       returning *`,
      [
        body.domain,
        body.name,
        body.brand ?? null,
        body.category ?? null,
        body.batch ?? null,
        body.manufacturedAt ?? null,
        body.expiresAt ?? null,
        body.location ?? null,
        body.barcode ?? null,
        body.photoPath ?? null,
        body.photoUrl ?? null,
        body.sourceLink ?? null,
        body.quantity ?? null,
        body.minQuantity ?? null,
      ],
    );

    return reply.code(201).send({ item: result.rows[0] });
  });

  app.patch("/inventory/items/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const fields = req.body as Record<string, unknown>;

    const columnMap: Record<string, string> = {
      name: "name",
      brand: "brand",
      category: "category",
      batch: "batch",
      manufacturedAt: "manufactured_at",
      expiresAt: "expires_at",
      location: "location",
      barcode: "barcode",
      photoPath: "photo_path",
      photoUrl: "photo_url",
      sourceLink: "source_link",
      minQuantity: "min_quantity",
    };

    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(columnMap)) {
      if (key in fields) {
        values.push(fields[key]);
        sets.push(`${column} = $${values.length}`);
      }
    }

    if (sets.length === 0) {
      return reply.code(400).send({ error: "Nenhum campo para atualizar." });
    }

    values.push(id);
    const result = await pool.query(
      `update inventory_items set ${sets.join(", ")}, updated_at = now() where id = $${values.length} returning *`,
      values,
    );

    if (result.rowCount === 0) return reply.code(404).send({ error: "Item não encontrado." });
    return { item: result.rows[0] };
  });

  app.delete("/inventory/items/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await pool.query("delete from inventory_items where id = $1", [id]);
    return reply.code(204).send();
  });

  app.get("/inventory/low-stock", async (req) => {
    const { domain } = req.query as { domain?: Domain };
    const result = domain
      ? await pool.query(
          "select * from inventory_items where domain = $1 and min_quantity is not null and quantity <= min_quantity order by name",
          [domain],
        )
      : await pool.query(
          "select * from inventory_items where min_quantity is not null and quantity <= min_quantity order by name",
        );
    return { items: result.rows };
  });

  app.get("/inventory/usage-summary", async (req) => {
    const { days } = req.query as { days?: string };
    const numDays = Math.min(Math.max(Number(days) || 14, 1), 90);

    const result = await pool.query(
      `select
         d::date as date,
         coalesce(sum(case when m.type = 'entrada' then m.quantity else 0 end), 0) as entradas,
         coalesce(sum(case when m.type = 'saida' then m.quantity else 0 end), 0) as saidas
       from generate_series(current_date - ($1::int - 1), current_date, interval '1 day') d
       left join inventory_movements m on m.created_at::date = d::date
       group by d
       order by d`,
      [numDays],
    );

    return { days: result.rows };
  });

  app.post("/inventory/movements", async (req, reply) => {
    const body = req.body as {
      itemId: string;
      type: "entrada" | "saida" | "transferencia";
      quantity: number;
      fromLocation?: string;
      toLocation?: string;
    };

    if (!body.itemId || !body.type || !body.quantity) {
      return reply.code(400).send({ error: "itemId, type e quantity são obrigatórios." });
    }

    const client = await pool.connect();
    try {
      await client.query("begin");

      const itemResult = await client.query("select * from inventory_items where id = $1 for update", [body.itemId]);
      if (itemResult.rowCount === 0) {
        await client.query("rollback");
        return reply.code(404).send({ error: "Item não encontrado." });
      }
      const item = itemResult.rows[0];

      let newQuantity = Number(item.quantity);
      let newLocation = item.location;

      if (body.type === "entrada") {
        newQuantity += body.quantity;
        if (body.toLocation) newLocation = body.toLocation;
      } else if (body.type === "saida") {
        newQuantity -= body.quantity;
        if (newQuantity < 0) {
          await client.query("rollback");
          return reply.code(400).send({ error: "Quantidade insuficiente em estoque." });
        }
      } else if (body.type === "transferencia") {
        if (body.toLocation) newLocation = body.toLocation;
      }

      await client.query(
        "update inventory_items set quantity = $1, location = $2, updated_at = now() where id = $3",
        [newQuantity, newLocation, item.id],
      );

      const movementResult = await client.query(
        `insert into inventory_movements (item_id, type, quantity, from_location, to_location)
         values ($1, $2, $3, $4, $5) returning *`,
        [body.itemId, body.type, body.quantity, body.fromLocation ?? null, body.toLocation ?? null],
      );

      await client.query("commit");

      const belowMin = item.min_quantity !== null && newQuantity <= Number(item.min_quantity);
      return reply.code(201).send({ movement: movementResult.rows[0], belowMin });
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  });

  app.get("/inventory/wishlist", async (req) => {
    const { domain } = req.query as { domain?: Domain };
    const result = domain
      ? await pool.query("select * from wishlist_items where domain = $1 order by priority desc, created_at desc", [domain])
      : await pool.query("select * from wishlist_items order by priority desc, created_at desc");
    return { items: result.rows };
  });

  app.post("/inventory/wishlist", async (req, reply) => {
    const body = req.body as {
      domain: Domain;
      name: string;
      description?: string;
      priority?: "baixa" | "normal" | "alta";
      purchaseLink?: string;
      photoUrl?: string;
      price?: number;
    };

    if (!body.domain || !body.name) {
      return reply.code(400).send({ error: "domain e name são obrigatórios." });
    }

    const result = await pool.query(
      `insert into wishlist_items (domain, name, description, priority, purchase_link, photo_url, price)
       values ($1, $2, $3, coalesce($4, 'normal'), $5, $6, $7) returning *`,
      [
        body.domain,
        body.name,
        body.description ?? null,
        body.priority ?? null,
        body.purchaseLink ?? null,
        body.photoUrl ?? null,
        body.price ?? null,
      ],
    );

    return reply.code(201).send({ item: result.rows[0] });
  });

  app.delete("/inventory/wishlist/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await pool.query("delete from wishlist_items where id = $1", [id]);
    return reply.code(204).send();
  });
}
