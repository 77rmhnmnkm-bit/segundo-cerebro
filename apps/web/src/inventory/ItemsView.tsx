import { useEffect, useState } from "react";
import type { InventoryDomain, InventoryItem, MovementType } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { GlassModal } from "../GlassModal";
import { TextField, SelectField, PrimaryButton } from "../FormField";
import { createInventoryItem, createMovement, deleteInventoryItem, listInventoryItems, lookupProduct } from "../api";

const emptyForm = {
  name: "",
  brand: "",
  category: "",
  batch: "",
  manufacturedAt: "",
  expiresAt: "",
  location: "",
  barcode: "",
  quantity: "",
  minQuantity: "",
  sourceLink: "",
  photoUrl: "",
};

export function ItemsView({ domain }: { domain: InventoryDomain }) {
  const { theme } = useTheme();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function refresh() {
    setLoading(true);
    try {
      const { items } = await listInventoryItems(domain);
      setItems(items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [domain]);

  async function handleCreate() {
    await createInventoryItem({
      domain,
      name: form.name,
      brand: form.brand || undefined,
      category: form.category || undefined,
      batch: form.batch || undefined,
      manufacturedAt: form.manufacturedAt || undefined,
      expiresAt: form.expiresAt || undefined,
      location: form.location || undefined,
      barcode: form.barcode || undefined,
      photoUrl: form.photoUrl || undefined,
      sourceLink: form.sourceLink || undefined,
      quantity: form.quantity ? Number(form.quantity) : undefined,
      minQuantity: form.minQuantity ? Number(form.minQuantity) : undefined,
    });
    setForm(emptyForm);
    setLookupStatus("idle");
    setShowForm(false);
    refresh();
  }

  async function handleLookup() {
    if (!form.sourceLink.trim()) return;
    setLookupStatus("loading");
    try {
      const { product } = await lookupProduct(form.sourceLink.trim());
      setForm((prev) => ({
        ...prev,
        name: product.name || prev.name,
        photoUrl: product.imageUrl || prev.photoUrl,
      }));
      setLookupStatus("done");
    } catch {
      setLookupStatus("error");
    }
  }

  async function handleDelete(id: string) {
    await deleteInventoryItem(id);
    refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: theme.spacing.md }}>
        <PrimaryButton onClick={() => setShowForm(true)}>+ Novo item</PrimaryButton>
      </div>

      {loading && <div style={{ color: theme.colors.textSecondary }}>Carregando...</div>}

      {!loading && items.length === 0 && (
        <div
          style={{
            ...glassSurface(theme),
            padding: theme.spacing.lg,
            color: theme.colors.textSecondary,
            textAlign: "center",
          }}
        >
          Nenhum item cadastrado ainda neste domínio.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            isMoving={movingId === item.id}
            onToggleMove={() => setMovingId(movingId === item.id ? null : item.id)}
            onMoved={() => {
              setMovingId(null);
              refresh();
            }}
            onDelete={() => handleDelete(item.id)}
          />
        ))}
      </div>

      {showForm && (
        <GlassModal title="Novo item" onClose={() => setShowForm(false)}>
          <div style={{ display: "flex", gap: theme.spacing.sm, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <TextField
                label="Link da loja (opcional)"
                value={form.sourceLink}
                onChange={(v) => setForm({ ...form, sourceLink: v })}
                placeholder="Cole o link do produto na loja"
              />
            </div>
            <button
              type="button"
              onClick={handleLookup}
              disabled={!form.sourceLink.trim() || lookupStatus === "loading"}
              style={{
                background: theme.colors.primary,
                color: "#fff",
                border: "none",
                borderRadius: theme.radius.sm,
                padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
                fontSize: theme.typography.sizes.sm,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {lookupStatus === "loading" ? "Buscando..." : "Buscar foto/nome"}
            </button>
          </div>
          {lookupStatus === "error" && (
            <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.danger }}>
              Não consegui ler essa página. Preencha manualmente.
            </div>
          )}
          {form.name && (
            <a
              href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(form.name)}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.primary }}
            >
              🔍 Buscar "{form.name}" no Google Shopping
            </a>
          )}
          {form.photoUrl && (
            <img
              src={form.photoUrl}
              alt=""
              style={{ width: 80, height: 80, objectFit: "contain", borderRadius: theme.radius.sm, background: "#fff", alignSelf: "flex-start" }}
            />
          )}
          <TextField label="Nome" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <TextField label="Marca" value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} />
          <TextField label="Categoria" value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
          <TextField label="Lote" value={form.batch} onChange={(v) => setForm({ ...form, batch: v })} />
          <TextField
            label="Fabricação"
            type="date"
            value={form.manufacturedAt}
            onChange={(v) => setForm({ ...form, manufacturedAt: v })}
          />
          <TextField
            label="Validade"
            type="date"
            value={form.expiresAt}
            onChange={(v) => setForm({ ...form, expiresAt: v })}
          />
          <TextField label="Local armazenado" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
          <TextField label="Código de barras" value={form.barcode} onChange={(v) => setForm({ ...form, barcode: v })} />
          <TextField
            label="Quantidade inicial"
            type="number"
            value={form.quantity}
            onChange={(v) => setForm({ ...form, quantity: v })}
          />
          <TextField
            label="Quantidade mínima"
            type="number"
            value={form.minQuantity}
            onChange={(v) => setForm({ ...form, minQuantity: v })}
          />
          <PrimaryButton onClick={handleCreate} disabled={!form.name}>
            Salvar item
          </PrimaryButton>
        </GlassModal>
      )}
    </div>
  );
}

function ItemRow({
  item,
  isMoving,
  onToggleMove,
  onMoved,
  onDelete,
}: {
  item: InventoryItem;
  isMoving: boolean;
  onToggleMove: () => void;
  onMoved: () => void;
  onDelete: () => void;
}) {
  const { theme } = useTheme();
  const belowMin = item.min_quantity !== null && Number(item.quantity) <= Number(item.min_quantity);
  const expiringSoon = item.expires_at && isWithinDays(item.expires_at, 30);
  const expired = item.expires_at && new Date(item.expires_at) < new Date();

  return (
    <div style={{ ...glassSurface(theme), padding: theme.spacing.md }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: theme.spacing.md }}>
        <div style={{ display: "flex", gap: theme.spacing.sm }}>
          {item.photo_url && (
            <img
              src={item.photo_url}
              alt=""
              style={{ width: 40, height: 40, objectFit: "contain", borderRadius: theme.radius.sm, background: "#fff", flexShrink: 0 }}
            />
          )}
          <div>
          <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
            {item.name}
          </div>
          <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary }}>
            {[item.brand, item.category].filter(Boolean).join(" · ") || "—"}
            {item.location ? ` · ${item.location}` : ""}
          </div>
          {item.expires_at && (
            <div
              style={{
                fontSize: theme.typography.sizes.xs,
                color: expired ? theme.colors.danger : expiringSoon ? theme.colors.warning : theme.colors.textSecondary,
                marginTop: 2,
              }}
            >
              Validade: {new Date(item.expires_at).toLocaleDateString("pt-BR")}
              {expired ? " (vencido)" : expiringSoon ? " (vencendo)" : ""}
            </div>
          )}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontWeight: theme.typography.weights.bold,
              fontSize: theme.typography.sizes.lg,
              color: belowMin ? theme.colors.danger : theme.colors.textPrimary,
            }}
          >
            {Number(item.quantity)}
          </div>
          {item.min_quantity !== null && (
            <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
              mín. {Number(item.min_quantity)}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
        <SmallButton theme={theme} onClick={onToggleMove}>
          {isMoving ? "Cancelar" : "Movimentar"}
        </SmallButton>
        <SmallButton theme={theme} onClick={onDelete} danger>
          Remover
        </SmallButton>
      </div>

      {isMoving && <MovementForm item={item} onDone={onMoved} />}
    </div>
  );
}

function MovementForm({ item, onDone }: { item: InventoryItem; onDone: () => void }) {
  const { theme } = useTheme();
  const [type, setType] = useState<MovementType>("entrada");
  const [quantity, setQuantity] = useState("1");
  const [toLocation, setToLocation] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await createMovement({
        itemId: item.id,
        type,
        quantity: Number(quantity),
        toLocation: toLocation || undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar movimentação.");
    }
  }

  return (
    <div
      style={{
        marginTop: theme.spacing.sm,
        paddingTop: theme.spacing.sm,
        borderTop: `1px solid ${theme.glass.borderSoft}`,
        display: "flex",
        flexWrap: "wrap",
        gap: theme.spacing.sm,
        alignItems: "flex-end",
      }}
    >
      <div style={{ width: 160 }}>
        <SelectField
          label="Tipo"
          value={type}
          onChange={setType}
          options={[
            { value: "entrada", label: "Entrada" },
            { value: "saida", label: "Saída" },
            { value: "transferencia", label: "Transferência" },
          ]}
        />
      </div>
      <div style={{ width: 100 }}>
        <TextField label="Quantidade" type="number" value={quantity} onChange={setQuantity} />
      </div>
      {(type === "entrada" || type === "transferencia") && (
        <div style={{ width: 180 }}>
          <TextField label="Novo local" value={toLocation} onChange={setToLocation} />
        </div>
      )}
      <PrimaryButton onClick={submit}>Confirmar</PrimaryButton>
      {error && <div style={{ color: theme.colors.danger, fontSize: theme.typography.sizes.sm }}>{error}</div>}
    </div>
  );
}

function SmallButton({
  theme,
  onClick,
  children,
  danger,
}: {
  theme: ReturnType<typeof useTheme>["theme"];
  onClick: () => void;
  children: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: `1px solid ${danger ? theme.colors.danger + "55" : theme.glass.borderSoft}`,
        color: danger ? theme.colors.danger : theme.colors.textSecondary,
        borderRadius: theme.radius.sm,
        padding: `${theme.spacing.xs}px ${theme.spacing.sm}px`,
        fontSize: theme.typography.sizes.xs,
        cursor: "pointer",
        transition: `transform ${theme.motion.fast}ms ${theme.motion.spring}`,
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );
}

function isWithinDays(dateStr: string, days: number): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
}
