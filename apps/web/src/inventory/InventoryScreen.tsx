import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { InventoryDomain } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { SegmentedControl } from "../SegmentedControl";
import { ItemsView } from "./ItemsView";
import { DrawerGrid } from "./DrawerGrid";
import { WishlistView } from "./WishlistView";

type Section = "materiais" | "gavetas" | "desejos";

export function InventoryScreen() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [domain, setDomain] = useState<InventoryDomain>("trabalho");
  const [section, setSection] = useState<Section>("materiais");

  return (
    <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", padding: theme.spacing.xl }}>
      <header
        style={{
          ...glassSurface(theme, { radius: theme.radius.lg }),
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: theme.spacing.md,
          padding: `${theme.spacing.md}px ${theme.spacing.lg}px`,
          marginBottom: theme.spacing.xl,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.md }}>
          <button
            onClick={() => navigate("/")}
            aria-label="Voltar"
            style={{
              border: "none",
              background: "transparent",
              color: theme.colors.textSecondary,
              fontSize: theme.typography.sizes.lg,
              cursor: "pointer",
              padding: 4,
            }}
          >
            ←
          </button>
          <div>
            <div
              style={{
                fontSize: theme.typography.sizes.xl,
                fontWeight: theme.typography.weights.bold,
                letterSpacing: theme.typography.tracking.tight,
                color: theme.colors.textPrimary,
              }}
            >
              Estoque
            </div>
            <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>
              Materiais, instrumentais e desejos, por domínio.
            </div>
          </div>
        </div>

        <SegmentedControl
          value={domain}
          onChange={setDomain}
          options={[
            { value: "trabalho", label: "Trabalho/Clínica" },
            { value: "pessoal", label: "Pessoal" },
          ]}
        />
      </header>

      <div style={{ marginBottom: theme.spacing.lg }}>
        <SegmentedControl
          value={section}
          onChange={setSection}
          options={[
            { value: "materiais", label: "Materiais e Instrumentais" },
            { value: "gavetas", label: "Gavetas" },
            { value: "desejos", label: "Lista de Desejos" },
          ]}
        />
      </div>

      {section === "materiais" && <ItemsView domain={domain} />}
      {section === "gavetas" && <DrawerGrid domain={domain} />}
      {section === "desejos" && <WishlistView domain={domain} />}
    </div>
  );
}
