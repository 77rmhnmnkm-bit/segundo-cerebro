import { useTheme } from "./ThemeProvider";
import { useVoiceRecorder } from "./useVoiceRecorder";

export function VoiceButton({ onTranscribed, compact = false }: { onTranscribed: (text: string) => void; compact?: boolean }) {
  const { theme } = useTheme();
  const voice = useVoiceRecorder(onTranscribed);

  const label = voice.transcribing ? "..." : voice.recording ? "⏹" : "🎙";
  const fullLabel = voice.transcribing ? "Transcrevendo..." : voice.recording ? "⏹ Parar" : "🎙 Ditar";

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
      <button
        type="button"
        onClick={voice.recording ? voice.stop : voice.start}
        disabled={voice.transcribing}
        title="Ditar por voz"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          background: voice.recording ? theme.colors.danger : "transparent",
          color: voice.recording ? "#fff" : theme.colors.primary,
          border: `1px solid ${voice.recording ? theme.colors.danger : theme.colors.primary}`,
          borderRadius: theme.radius.full,
          padding: compact ? "4px" : `2px ${theme.spacing.sm}px`,
          width: compact ? 26 : undefined,
          height: compact ? 26 : undefined,
          fontSize: theme.typography.sizes.xs,
          lineHeight: 1.4,
          cursor: voice.transcribing ? "default" : "pointer",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {compact ? label : fullLabel}
      </button>
      {voice.error && <span style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.danger }}>{voice.error}</span>}
    </div>
  );
}
