import { useTheme } from "./ThemeProvider";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { theme } = useTheme();

  return (
    <div
      style={{
        display: "inline-flex",
        background: theme.mode === "light" ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)",
        border: `1px solid ${theme.glass.borderSoft}`,
        borderRadius: theme.radius.md,
        padding: 4,
        gap: 2,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              position: "relative",
              border: "none",
              background: active ? theme.colors.primary : "transparent",
              color: active ? theme.colors.onPrimary : theme.colors.textSecondary,
              fontSize: theme.typography.sizes.sm,
              fontWeight: theme.typography.weights.medium,
              padding: `${theme.spacing.xs + 2}px ${theme.spacing.md}px`,
              borderRadius: theme.radius.sm + 2,
              cursor: "pointer",
              boxShadow: active ? `0 4px 14px -4px ${theme.colors.primary}80` : "none",
              transition: `background ${theme.motion.normal}ms ${theme.motion.spring}, color ${theme.motion.fast}ms, box-shadow ${theme.motion.normal}ms`,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
