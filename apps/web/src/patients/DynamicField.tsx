import type { FormTemplateField } from "@app/core";
import { useTheme } from "../ThemeProvider";
import { VoiceButton } from "../VoiceButton";

export type FieldValue = string | string[] | Record<string, string>[] | undefined;

const fieldBaseStyle = (theme: ReturnType<typeof useTheme>["theme"]) => ({
  background: theme.mode === "light" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.06)",
  border: `1px solid ${theme.glass.borderSoft}`,
  borderRadius: theme.radius.sm,
  padding: `${theme.spacing.sm}px ${theme.spacing.sm + 4}px`,
  fontSize: theme.typography.sizes.sm,
  color: theme.colors.textPrimary,
  outline: "none",
  width: "100%",
  fontFamily: "inherit",
});

export function DynamicField({
  field,
  value,
  onChange,
}: {
  field: FormTemplateField;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
}) {
  const { theme } = useTheme();
  const label = (
    <span style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary }}>{field.label}</span>
  );

  if (field.field_type === "textarea") {
    return (
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: theme.spacing.sm }}>
          {label}
          <VoiceButton onTranscribed={(t) => onChange(value ? `${value as string} ${t}` : t)} />
        </div>
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={{ ...fieldBaseStyle(theme), resize: "vertical" }}
        />
      </label>
    );
  }

  if (field.field_type === "select") {
    const options = (field.options as string[]) ?? [];
    return (
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {label}
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} style={fieldBaseStyle(theme)}>
          <option value="">—</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.field_type === "checkbox_group") {
    const options = (field.options as string[]) ?? [];
    const selected = (value as string[]) ?? [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {label}
        {options.map((opt) => (
          <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary }}>
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={(e) => {
                if (e.target.checked) onChange([...selected, opt]);
                else onChange(selected.filter((s) => s !== opt));
              }}
              style={{ accentColor: theme.colors.primary }}
            />
            {opt}
          </label>
        ))}
      </div>
    );
  }

  if (field.field_type === "table") {
    const columns = (field.options as { columns: string[] })?.columns ?? [];
    const rows = (value as Record<string, string>[]) ?? [];

    function updateCell(rowIndex: number, col: string, val: string) {
      const next = rows.map((r, i) => (i === rowIndex ? { ...r, [col]: val } : r));
      onChange(next);
    }

    function addRow() {
      onChange([...rows, Object.fromEntries(columns.map((c) => [c, ""]))]);
    }

    function removeRow(index: number) {
      onChange(rows.filter((_, i) => i !== index));
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {label}
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {columns.map((col) => (
              <input
                key={col}
                value={row[col] ?? ""}
                placeholder={col}
                onChange={(e) => updateCell(i, col, e.target.value)}
                style={{ ...fieldBaseStyle(theme), flex: 1, fontSize: theme.typography.sizes.xs }}
              />
            ))}
            <button type="button" onClick={() => removeRow(i)} style={{ background: "none", border: "none", color: theme.colors.textSecondary, cursor: "pointer" }}>
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          style={{
            alignSelf: "flex-start",
            background: "none",
            border: `1px dashed ${theme.glass.borderSoft}`,
            borderRadius: theme.radius.sm,
            color: theme.colors.textSecondary,
            fontSize: theme.typography.sizes.xs,
            padding: `4px ${theme.spacing.sm}px`,
            cursor: "pointer",
          }}
        >
          + Adicionar linha
        </button>
      </div>
    );
  }

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label}
      <input
        type={field.field_type === "date" ? "date" : field.field_type === "number" ? "number" : "text"}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={fieldBaseStyle(theme)}
      />
    </label>
  );
}
