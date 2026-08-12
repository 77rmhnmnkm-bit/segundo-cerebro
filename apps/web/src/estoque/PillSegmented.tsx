import { useLayoutEffect, useRef, useState } from "react";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";

export type PillOption<T extends string> = {
  value: T;
  label: string;
  badge?: string;
  badgeTone?: "accent" | "warning";
};

// Controle segmentado tipo "pílula de vidro" com um indicador que desliza
// entre os segmentos (mede a posição do botão ativo e anima left/top/width
// via CSS, em vez de só trocar o fundo do botão na hora — é o item que o
// SegmentedControl genérico do app não faz, e que o protótipo pedia
// explicitamente para melhorar: "desliza em vez de piscar").
export function PillSegmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  compact,
  className,
}: {
  options: PillOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  compact?: boolean;
  className?: string;
}) {
  const { theme } = useTheme();
  const btnRefs = useRef<Map<T, HTMLButtonElement>>(new Map());
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // A pílula precisa remedir sempre que o CONTEÚDO do botão ativo mudar de
  // largura — não só quando o valor selecionado muda. O selo de contagem
  // (215/54/111) chega depois, assíncrono (contagens começa null e vira
  // número); se a dependência abaixo olhasse só rótulo+valor, a pílula era
  // medida com o botão ainda sem selo (mais estreito) e nunca era remedida
  // quando o selo aparecia — resultado: fundo mais estreito que o texto,
  // cortando o número. Por isso a serialização inclui o próprio selo.
  const assinatura = options.map((o) => `${o.label}:${o.badge ?? ""}`).join("|");
  useLayoutEffect(() => {
    function medir() {
      const el = btnRefs.current.get(value);
      if (!el) return;
      setRect({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
    }
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [value, assinatura]);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={className}
      style={{
        position: "relative",
        display: "inline-flex",
        gap: 2,
        padding: 3,
        ...glassSurface(theme, { radius: theme.radius.md }),
      }}
    >
      {rect && (
        <div
          aria-hidden
          className="lr-pill-indicator"
          style={{
            position: "absolute",
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            borderRadius: theme.radius.sm,
            background: theme.glass.surfaceStrong,
            boxShadow: `0 1px 3px ${theme.glass.shadow}`,
          }}
        />
      )}
      {options.map((opt) => {
        const active = opt.value === value;
        const toneCor = opt.badgeTone === "warning" ? theme.colors.warning : theme.colors.primary;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              if (el) btnRefs.current.set(opt.value, el);
              else btnRefs.current.delete(opt.value);
            }}
            type="button"
            className="lr-pill-btn"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            style={{
              position: "relative",
              zIndex: 1,
              border: "none",
              background: "transparent",
              color: active ? theme.colors.textPrimary : theme.colors.textSecondary,
              fontSize: compact ? 12 : 12.5,
              fontWeight: active ? theme.typography.weights.semibold : theme.typography.weights.medium,
              padding: compact ? "6px 11px" : "6px 12px",
              borderRadius: theme.radius.sm,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 9,
              whiteSpace: "nowrap",
              transition: `color ${theme.motion.fast}ms ease`,
            }}
          >
            {opt.label}
            {opt.badge != null && (
              <span
                className="lr-pill-badge"
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 5,
                  background: `${toneCor}22`,
                  color: toneCor,
                  fontVariantNumeric: "tabular-nums",
                  flex: "none",
                }}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
