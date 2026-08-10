import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import type { AssistantMessage } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { clearAssistantMemory, getModuleTip, getPatientTip, getProactiveTip, listAssistantMemory, sendAssistantMessage } from "../api";
import { useGlassSpecular, specularOverlayStyle } from "../useGlassSpecular";

const PROACTIVE_TIP_KEY = "sc_proactive_tip_date";
// Limiar de permanência numa tela antes do assistente decidir, por conta
// própria, se há algo real que vale comentar — não é uma piada genérica,
// ele busca o contexto daquela área específica (paciente, estoque, agenda,
// financeiro, biblioteca) na hora. Consciência espalhada por todo o app,
// não só na ficha do paciente.
const DWELL_MS = 90_000;
const MODULE_ROUTES: Record<string, string> = {
  "/estoque": "estoque",
  "/agenda": "agenda",
  "/financeiro": "financeiro",
  "/biblioteca": "biblioteca",
};

export function FloatingAssistant() {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bubbleSpecular = useGlassSpecular<HTMLButtonElement>();
  const [bubbleHovered, setBubbleHovered] = useState(false);
  const [proactiveTip, setProactiveTip] = useState<string | null>(null);
  const location = useLocation();
  const shownForKeyRef = useRef<Set<string>>(new Set());

  // Consciência de contexto em todo o app: percebe sozinho quando você está
  // há um tempo em qualquer tela e, se achar algo real que valha a pena,
  // fala por conta própria — sem você pedir. Reseta o timer a cada troca
  // de página. Paciente tem contexto dedicado (aquele caso específico);
  // as outras telas usam o contexto geral focado naquela área.
  useEffect(() => {
    const patientMatch = location.pathname.match(/^\/pacientes\/([^/]+)$/);
    const moduleKey = MODULE_ROUTES[location.pathname];

    if (!patientMatch && !moduleKey) return;
    const key = patientMatch ? `patient:${patientMatch[1]}` : `module:${moduleKey}`;
    if (shownForKeyRef.current.has(key)) return;

    const timer = setTimeout(() => {
      shownForKeyRef.current.add(key);
      const fetchTip = patientMatch ? getPatientTip(patientMatch[1]) : getModuleTip(moduleKey);
      fetchTip
        .then(({ tip }) => {
          if (tip) setProactiveTip(tip);
        })
        .catch(() => {});
    }, DWELL_MS);

    return () => clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    if (open) listAssistantMemory().then(({ messages }) => setMessages(messages));
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // "Fala comigo sem eu pedir" — once per day, after settling on the page a
  // moment, the assistant volunteers a short remark grounded in real data
  // (or stays quiet if nothing's worth saying). Throttled via localStorage
  // so it doesn't nag on every reload.
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(PROACTIVE_TIP_KEY) === today) return;

    const timer = setTimeout(() => {
      localStorage.setItem(PROACTIVE_TIP_KEY, today);
      getProactiveTip()
        .then(({ tip }) => {
          if (tip) setProactiveTip(tip);
        })
        .catch(() => {});
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const message = text.trim();
    if (!message || loading) return;
    setText("");
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content: message, created_at: new Date().toISOString() }]);
    setLoading(true);
    try {
      const { reply } = await sendAssistantMessage(message);
      setMessages((prev) => [...prev, { id: `local-${Date.now()}-r`, role: "assistant", content: reply, created_at: new Date().toISOString() }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}-e`, role: "assistant", content: `⚠️ ${err instanceof Error ? err.message : "Erro ao consultar o assistente."}`, created_at: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    await clearAssistantMemory();
    setMessages([]);
  }

  return (
    <div style={{ position: "fixed", bottom: 14, right: 14, zIndex: 40, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
      {!open && proactiveTip && (
        <div
          onClick={() => {
            setOpen(true);
            setProactiveTip(null);
          }}
          style={{
            ...glassSurface(theme, { strong: true, radius: theme.radius.md }),
            maxWidth: 260,
            padding: theme.spacing.sm,
            fontSize: theme.typography.sizes.xs,
            color: theme.colors.textPrimary,
            cursor: "pointer",
            position: "relative",
            animation: "sc-bubble-in 320ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          <style>{`@keyframes sc-bubble-in { from { opacity: 0; transform: translateY(6px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setProactiveTip(null);
            }}
            style={{
              position: "absolute",
              top: 4,
              right: 6,
              background: "none",
              border: "none",
              color: theme.colors.textSecondary,
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
          <div style={{ paddingRight: 12 }}>
            <span style={{ color: theme.colors.primary }}>✦ </span>
            {proactiveTip}
          </div>
        </div>
      )}

      {open && (
        <div
          style={{
            ...glassSurface(theme, { strong: true, radius: theme.radius.lg }),
            width: 340,
            height: 440,
            display: "flex",
            flexDirection: "column",
            padding: theme.spacing.md,
            animation: "sc-pop 220ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          <style>{`@keyframes sc-pop { from { opacity: 0; transform: scale(0.92) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }`}</style>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: theme.spacing.sm }}>
            <span style={{ fontSize: theme.typography.sizes.md, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
              ✦ Assistente
            </span>
            <button onClick={handleClear} style={{ background: "none", border: "none", color: theme.colors.textSecondary, fontSize: theme.typography.sizes.xs, cursor: "pointer" }}>
              Limpar
            </button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: theme.spacing.sm }}>
            {messages.length === 0 && (
              <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.xs }}>
                Pergunte sobre pacientes, agenda, estoque... Configurações em ⚙ no dashboard.
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  ...glassSurface(theme, { strong: m.role === "assistant" }),
                  padding: theme.spacing.sm,
                  maxWidth: "85%",
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  whiteSpace: "pre-wrap",
                  fontSize: theme.typography.sizes.xs,
                  color: theme.colors.textPrimary,
                }}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div style={{ ...glassSurface(theme), padding: theme.spacing.sm, alignSelf: "flex-start", color: theme.colors.textSecondary, fontSize: theme.typography.sizes.xs }}>
                Pensando...
              </div>
            )}
          </div>

          <form onSubmit={handleSend} style={{ display: "flex", gap: 6 }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Pergunte algo..."
              style={{
                flex: 1,
                background: theme.mode === "light" ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.08)",
                border: `1px solid ${theme.glass.borderSoft}`,
                borderRadius: theme.radius.sm,
                padding: `6px ${theme.spacing.sm}px`,
                fontSize: theme.typography.sizes.xs,
                color: theme.colors.textPrimary,
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={loading || !text.trim()}
              style={{
                background: theme.colors.primary,
                color: theme.colors.onPrimary,
                border: "none",
                borderRadius: theme.radius.sm,
                padding: `0 ${theme.spacing.sm + 4}px`,
                fontSize: theme.typography.sizes.xs,
                fontWeight: theme.typography.weights.semibold,
                cursor: loading ? "default" : "pointer",
                opacity: loading || !text.trim() ? 0.6 : 1,
              }}
            >
              ➤
            </button>
          </form>
        </div>
      )}

      <button
        ref={bubbleSpecular.ref}
        onMouseMove={bubbleSpecular.onMouseMove}
        onMouseEnter={() => setBubbleHovered(true)}
        onMouseLeave={() => {
          bubbleSpecular.onMouseLeave();
          setBubbleHovered(false);
        }}
        onClick={() => setOpen((v) => !v)}
        aria-label="Assistente"
        style={{
          position: "relative",
          width: 56,
          height: 56,
          border: "none",
          background: "transparent",
          color: open || bubbleHovered ? theme.colors.primary : theme.mode === "light" ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.7)",
          fontSize: 22,
          cursor: "pointer",
          transition: `color ${theme.motion.normal}ms ${theme.motion.easing}`,
          animation: "sc-mount-fade 600ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <style>{`
          @keyframes sc-icon-dance {
            0%, 100% { transform: scale(1) rotate(0deg); filter: brightness(1); }
            30% { transform: scale(1.25) rotate(15deg); filter: brightness(1.5); }
            55% { transform: scale(0.92) rotate(-10deg); filter: brightness(1.15); }
            80% { transform: scale(1.08) rotate(5deg); filter: brightness(1.25); }
          }
          @keyframes sc-mount-fade {
            from { opacity: 0; transform: scale(0.7); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>

        {/* The playful transparent-until-hover "ball" is only for the closed,
            resting state. Once the chat panel is open, this button's job is
            just "close" — it stays a plain, fully opaque circle the whole
            time so it never gets hard to read while reaching for it. */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `1px solid ${open || bubbleHovered ? theme.colors.primary + "66" : "transparent"}`,
            background: open
              ? theme.glass.surfaceStrong
              : bubbleHovered
                ? theme.mode === "light" ? `${theme.colors.primary}1a` : `${theme.colors.primary}14`
                : "transparent",
            backdropFilter: open || bubbleHovered ? `blur(${theme.glass.blur})` : "none",
            WebkitBackdropFilter: open || bubbleHovered ? `blur(${theme.glass.blur})` : "none",
            boxShadow: open || bubbleHovered ? `0 10px 30px -10px ${theme.colors.primary}55` : "none",
            opacity: open || bubbleHovered ? 1 : 0,
            transform: open || bubbleHovered ? "scale(1)" : "scale(0.55)",
            transition: `opacity ${theme.motion.normal}ms ${theme.motion.easing}, transform ${theme.motion.normal}ms ${theme.motion.spring}`,
          }}
        />
        {!open && bubbleHovered && <span aria-hidden style={{ ...specularOverlayStyle, borderRadius: "50%" }} />}
        <span
          style={{
            position: "relative",
            display: "inline-block",
            animation: !open && bubbleHovered ? "sc-icon-dance 900ms ease-in-out" : "none",
          }}
        >
          {open ? "✕" : "✦"}
        </span>
      </button>
    </div>
  );
}
