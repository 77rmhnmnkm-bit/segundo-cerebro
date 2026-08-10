import { useEffect, useMemo, useState } from "react";
import type { InventoryDomain, InventoryItem } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { GlassModal } from "../GlassModal";
import { listInventoryItems } from "../api";

const SWATCH_COLORS = ["#0E7C7B", "#7B5EA7", "#C97A1A", "#2E8B57", "#C23B3B", "#3D7BD9"];

export function DrawerGrid({ domain }: { domain: InventoryDomain }) {
  const { theme } = useTheme();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listInventoryItems(domain)
      .then(({ items }) => setItems(items))
      .finally(() => setLoading(false));
  }, [domain]);

  const groups = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    for (const item of items) {
      const key = item.location || "Sem local definido";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries());
  }, [items]);

  if (loading) return <div style={{ color: theme.colors.textSecondary }}>Carregando...</div>;

  if (items.length === 0) {
    return (
      <div style={{ ...glassSurface(theme), padding: theme.spacing.lg, color: theme.colors.textSecondary, textAlign: "center" }}>
        Nenhum item para mostrar nas gavetas ainda.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.lg }}>
      {groups.map(([location, groupItems]) => (
        <div key={location}>
          <div
            style={{
              fontSize: theme.typography.sizes.sm,
              fontWeight: theme.typography.weights.semibold,
              color: theme.colors.textSecondary,
              marginBottom: theme.spacing.sm,
              textTransform: "uppercase",
              letterSpacing: theme.typography.tracking.normal,
            }}
          >
            {location}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: theme.spacing.sm,
            }}
          >
            {groupItems.map((item) => (
              <DrawerTile key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DrawerTile({ item }: { item: InventoryItem }) {
  const { theme } = useTheme();
  const color = SWATCH_COLORS[hashString(item.name) % SWATCH_COLORS.length];
  const [showInfo, setShowInfo] = useState(false);
  const photo = item.photo_path || item.photo_url;

  return (
    <>
    <div
      style={{
        ...glassSurface(theme, { radius: theme.radius.md }),
        padding: theme.spacing.sm,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: theme.spacing.xs,
        transition: `transform ${theme.motion.normal}ms ${theme.motion.spring}`,
        cursor: "pointer",
      }}
      onClick={() => setShowInfo(true)}
      onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.04)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {photo ? (
        <img
          src={photo}
          alt={item.name}
          style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: theme.radius.sm }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: 80,
            borderRadius: theme.radius.sm,
            background: `linear-gradient(135deg, ${color}, ${color}99)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: theme.typography.sizes.xl,
            fontWeight: theme.typography.weights.bold,
          }}
        >
          {item.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div
        style={{
          fontSize: theme.typography.sizes.xs,
          color: theme.colors.textPrimary,
          textAlign: "center",
          fontWeight: theme.typography.weights.medium,
        }}
      >
        {item.name}
      </div>
      <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
        {Number(item.quantity)} un.
      </div>
    </div>

    {showInfo && (
      <GlassModal title={item.name} onClose={() => setShowInfo(false)}>
        {photo && (
          <img src={photo} alt="" style={{ width: 120, height: 120, objectFit: "contain", borderRadius: theme.radius.sm, background: "#fff", alignSelf: "center" }} />
        )}
        <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary, display: "flex", flexDirection: "column", gap: 4 }}>
          {item.brand && <div><strong>Marca:</strong> {item.brand}</div>}
          {item.category && <div><strong>Categoria:</strong> {item.category}</div>}
          {item.batch && <div><strong>Lote:</strong> {item.batch}</div>}
          {item.barcode && <div><strong>Código de barras:</strong> {item.barcode}</div>}
          {item.expires_at && <div><strong>Validade:</strong> {new Date(item.expires_at).toLocaleDateString("pt-BR")}</div>}
          <div><strong>Local:</strong> {item.location || "—"}</div>
          <div><strong>Quantidade:</strong> {Number(item.quantity)}</div>
        </div>
        {item.source_link && (
          <a href={item.source_link} target="_blank" rel="noreferrer" style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.primary }}>
            Ver na loja
          </a>
        )}
      </GlassModal>
    )}
    </>
  );
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
