import { useEffect, useState } from "react";
import type { InventoryDomain, WishlistItem, WishlistPriority } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { formatBRL } from "../format";
import { GlassModal } from "../GlassModal";
import { TextField, SelectField, PrimaryButton } from "../FormField";
import { createWishlistItem, deleteWishlistItem, listWishlist, lookupProduct } from "../api";

const PRIORITY_COLOR: Record<WishlistPriority, string> = {
  alta: "#C23B3B",
  normal: "#C97A1A",
  baixa: "#6B6862",
};

export function WishlistView({ domain }: { domain: InventoryDomain }) {
  const { theme } = useTheme();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<WishlistPriority>("normal");
  const [purchaseLink, setPurchaseLink] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [price, setPrice] = useState<number | undefined>(undefined);
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function refresh() {
    setLoading(true);
    try {
      const { items } = await listWishlist(domain);
      setItems(items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [domain]);

  async function handleCreate() {
    await createWishlistItem({
      domain,
      name,
      description: description || undefined,
      priority,
      purchaseLink: purchaseLink || undefined,
      photoUrl: photoUrl || undefined,
      price,
    });
    setName("");
    setDescription("");
    setPriority("normal");
    setPurchaseLink("");
    setPhotoUrl("");
    setPrice(undefined);
    setLookupStatus("idle");
    setShowForm(false);
    refresh();
  }

  async function handleLookup() {
    if (!purchaseLink.trim()) return;
    setLookupStatus("loading");
    try {
      const { product } = await lookupProduct(purchaseLink.trim());
      if (product.name && !name) setName(product.name);
      if (product.imageUrl) setPhotoUrl(product.imageUrl);
      if (product.price) setPrice(product.price);
      setLookupStatus("done");
    } catch {
      setLookupStatus("error");
    }
  }

  async function handleDelete(id: string) {
    await deleteWishlistItem(id);
    refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: theme.spacing.md }}>
        <PrimaryButton onClick={() => setShowForm(true)}>+ Novo desejo</PrimaryButton>
      </div>

      {loading && <div style={{ color: theme.colors.textSecondary }}>Carregando...</div>}

      {!loading && items.length === 0 && (
        <div style={{ ...glassSurface(theme), padding: theme.spacing.lg, color: theme.colors.textSecondary, textAlign: "center" }}>
          Nenhum item na lista de desejos ainda.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              ...glassSurface(theme),
              padding: theme.spacing.md,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: theme.spacing.md,
            }}
          >
            <div style={{ display: "flex", gap: theme.spacing.sm }}>
              {item.photo_url && (
                <img
                  src={item.photo_url}
                  alt=""
                  style={{ width: 40, height: 40, objectFit: "contain", borderRadius: theme.radius.sm, background: "#fff", flexShrink: 0 }}
                />
              )}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.sm }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: PRIORITY_COLOR[item.priority],
                    }}
                  />
                  <span style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
                    {item.name}
                  </span>
                  {item.price && (
                    <span style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
                      {formatBRL(Number(item.price))}
                    </span>
                  )}
                </div>
                {item.description && (
                  <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary, marginTop: 2 }}>
                    {item.description}
                  </div>
                )}
                {item.purchase_link && (
                  <a
                    href={item.purchase_link}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.primary }}
                  >
                    Link de compra (mais barato)
                  </a>
                )}
              </div>
            </div>
            <button
              onClick={() => handleDelete(item.id)}
              style={{
                background: "transparent",
                border: `1px solid ${theme.glass.borderSoft}`,
                color: theme.colors.textSecondary,
                borderRadius: theme.radius.sm,
                padding: `${theme.spacing.xs}px ${theme.spacing.sm}px`,
                fontSize: theme.typography.sizes.xs,
                cursor: "pointer",
              }}
            >
              Remover
            </button>
          </div>
        ))}
      </div>

      {showForm && (
        <GlassModal title="Novo item na lista de desejos" onClose={() => setShowForm(false)}>
          <TextField label="Nome" value={name} onChange={setName} required />
          <TextField label="Descrição" value={description} onChange={setDescription} />
          <SelectField
            label="Prioridade"
            value={priority}
            onChange={setPriority}
            options={[
              { value: "alta", label: "Alta" },
              { value: "normal", label: "Normal" },
              { value: "baixa", label: "Baixa" },
            ]}
          />
          <div style={{ display: "flex", gap: theme.spacing.sm, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <TextField label="Link de compra (mais barato encontrado)" value={purchaseLink} onChange={setPurchaseLink} />
            </div>
            <button
              type="button"
              onClick={handleLookup}
              disabled={!purchaseLink.trim() || lookupStatus === "loading"}
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
              {lookupStatus === "loading" ? "Buscando..." : "Buscar foto/preço"}
            </button>
          </div>
          {lookupStatus === "error" && (
            <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.danger }}>
              Não consegui ler essa página. Preencha manualmente.
            </div>
          )}
          {name && (
            <a
              href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(name)}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.primary }}
            >
              🔍 Buscar "{name}" no Google Shopping
            </a>
          )}
          {photoUrl && (
            <img src={photoUrl} alt="" style={{ width: 80, height: 80, objectFit: "contain", borderRadius: theme.radius.sm, background: "#fff" }} />
          )}
          <PrimaryButton onClick={handleCreate} disabled={!name}>
            Salvar
          </PrimaryButton>
        </GlassModal>
      )}
    </div>
  );
}
