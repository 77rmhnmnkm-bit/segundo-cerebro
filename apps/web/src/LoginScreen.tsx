import { useState, type FormEvent } from "react";
import { glassSurface } from "@app/ui";
import { login, setup, setToken } from "./api";
import { useTheme } from "./ThemeProvider";
import { useGlassSpecular, specularOverlayStyle } from "./useGlassSpecular";

export function LoginScreen({ isFirstRun, onAuthenticated }: { isFirstRun: boolean; onAuthenticated: () => void }) {
  const { theme } = useTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const specular = useGlassSpecular<HTMLFormElement>();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = isFirstRun
        ? await setup(name, email, password, rememberMe)
        : await login(email, password, rememberMe);
      setToken(result.token, rememberMe);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        zIndex: 1,
      }}
    >
      <form
        ref={specular.ref}
        onMouseMove={specular.onMouseMove}
        onMouseLeave={specular.onMouseLeave}
        onSubmit={handleSubmit}
        style={{
          width: 400,
          position: "relative",
          padding: theme.spacing.xl,
          display: "flex",
          flexDirection: "column",
          gap: theme.spacing.md,
          animation: "fadeUp 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
          ...glassSurface(theme, { strong: true, radius: theme.radius.xl }),
        }}
      >
        <style>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(18px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        <div aria-hidden style={specularOverlayStyle} />

        <div style={{ position: "relative" }}>
          <div
            style={{
              fontSize: theme.typography.sizes.xl,
              fontWeight: theme.typography.weights.bold,
              letterSpacing: theme.typography.tracking.tight,
              color: theme.colors.textPrimary,
            }}
          >
            {isFirstRun ? "Bem-vindo" : "Entrar"}
          </div>
          <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary, marginTop: 4 }}>
            {isFirstRun ? "Vamos configurar sua conta principal." : "Acesse seu segundo cérebro."}
          </div>
        </div>

        {isFirstRun && (
          <Field label="Nome" value={name} onChange={setName} type="text" theme={theme} />
        )}
        <Field label="E-mail" value={email} onChange={setEmail} type="email" theme={theme} />
        <Field label="Senha" value={password} onChange={setPassword} type="password" theme={theme} />

        <label
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: theme.spacing.sm,
            fontSize: theme.typography.sizes.sm,
            color: theme.colors.textSecondary,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            style={{ accentColor: theme.colors.primary, width: 16, height: 16 }}
          />
          Manter conectado neste dispositivo
        </label>

        {error && (
          <div style={{ position: "relative", color: theme.colors.danger, fontSize: theme.typography.sizes.sm }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            position: "relative",
            marginTop: theme.spacing.sm,
            background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.primaryAlt})`,
            color: theme.colors.onPrimary,
            border: "none",
            borderRadius: theme.radius.md,
            padding: `${theme.spacing.sm + 4}px ${theme.spacing.md}px`,
            fontSize: theme.typography.sizes.md,
            fontWeight: theme.typography.weights.semibold,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
            boxShadow: `0 10px 30px -10px ${theme.colors.primary}80`,
            transition: `transform ${theme.motion.fast}ms ${theme.motion.spring}, box-shadow ${theme.motion.normal}ms ${theme.motion.easing}`,
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          {loading ? "Entrando..." : isFirstRun ? "Criar conta" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  theme,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  return (
    <label style={{ position: "relative", display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        style={{
          background: theme.mode === "light" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.06)",
          border: `1px solid ${theme.glass.borderSoft}`,
          borderRadius: theme.radius.sm,
          padding: `${theme.spacing.sm + 2}px ${theme.spacing.sm + 4}px`,
          fontSize: theme.typography.sizes.md,
          color: theme.colors.textPrimary,
          outline: "none",
          transition: `border-color ${theme.motion.fast}ms, box-shadow ${theme.motion.fast}ms`,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = theme.colors.primary;
          e.currentTarget.style.boxShadow = `0 0 0 4px ${theme.colors.primary}26`;
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = theme.glass.borderSoft;
          e.currentTarget.style.boxShadow = "none";
        }}
      />
    </label>
  );
}
