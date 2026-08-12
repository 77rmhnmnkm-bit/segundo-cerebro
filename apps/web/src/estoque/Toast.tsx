import { useEffect } from "react";
import { createPortal } from "react-dom";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";

// Portal para <body>: mesmo motivo do GlassModal — um ancestral com
// backdrop-filter (todo card de vidro tem um) quebraria um position:fixed
// aqui dentro.
export function Toast({ mensagem, onFechar }: { mensagem: string | null; onFechar: () => void }) {
  const { theme } = useTheme();

  useEffect(() => {
    if (!mensagem) return;
    const t = window.setTimeout(onFechar, 2800);
    return () => window.clearTimeout(t);
  }, [mensagem, onFechar]);

  if (!mensagem) return null;

  return createPortal(
    <div
      role="status"
      className="lr-toast-in"
      style={{
        ...glassSurface(theme, { strong: true, radius: theme.radius.md }),
        position: "fixed",
        left: "50%",
        bottom: 26,
        zIndex: 95,
        padding: "11px 19px",
        fontSize: 13,
        fontWeight: 500,
        color: theme.colors.textPrimary,
        boxShadow: `0 14px 34px ${theme.glass.shadow}`,
        maxWidth: "90vw",
        textAlign: "center",
      }}
    >
      {mensagem}
    </div>,
    document.body,
  );
}
