import type { ReactNode } from "react";
import { useTheme } from "./ThemeProvider";
import { VoiceButton } from "./VoiceButton";

const fieldBaseStyle = (theme: ReturnType<typeof useTheme>["theme"]) => ({
  background: theme.mode === "light" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.06)",
  border: `1px solid ${theme.glass.borderSoft}`,
  borderRadius: theme.radius.sm,
  padding: `${theme.spacing.sm}px ${theme.spacing.sm + 4}px`,
  fontSize: theme.typography.sizes.md,
  color: theme.colors.textPrimary,
  outline: "none",
  width: "100%",
});

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  voice,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  voice?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: theme.spacing.sm }}>
        <span style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary }}>{label}</span>
        {voice && <VoiceButton onTranscribed={(t) => onChange(value ? `${value} ${t}` : t)} />}
      </div>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        style={fieldBaseStyle(theme)}
      />
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  const { theme } = useTheme();
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} style={fieldBaseStyle(theme)}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.primaryAlt})`,
        color: theme.colors.onPrimary,
        border: "none",
        borderRadius: theme.radius.md,
        padding: `${theme.spacing.sm + 2}px ${theme.spacing.md}px`,
        fontSize: theme.typography.sizes.md,
        fontWeight: theme.typography.weights.semibold,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        boxShadow: `0 10px 24px -10px ${theme.colors.primary}80`,
        transition: `transform ${theme.motion.fast}ms ${theme.motion.spring}`,
      }}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = "scale(0.97)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );
}
