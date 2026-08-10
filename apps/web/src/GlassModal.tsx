import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { glassSurface } from "@app/ui";
import { useTheme } from "./ThemeProvider";

export function GlassModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { theme } = useTheme();

  // Rendered via portal straight onto <body>: any ancestor with backdrop-filter
  // (every glass card uses one) creates a CSS containing block that breaks
  // `position: fixed` for descendants, which is why this was showing up
  // pinned near whatever panel opened it instead of centered on screen.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10,
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "sc-fade 0.2s ease-out",
      }}
    >
      <style>{`
        @keyframes sc-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sc-pop {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: "90vw",
          maxHeight: "85vh",
          overflowY: "auto",
          padding: theme.spacing.lg,
          display: "flex",
          flexDirection: "column",
          gap: theme.spacing.md,
          animation: `sc-pop ${theme.motion.normal}ms ${theme.motion.spring}`,
          ...glassSurface(theme, { strong: true, radius: theme.radius.xl }),
        }}
      >
        <div
          style={{
            fontSize: theme.typography.sizes.lg,
            fontWeight: theme.typography.weights.semibold,
            color: theme.colors.textPrimary,
          }}
        >
          {title}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
