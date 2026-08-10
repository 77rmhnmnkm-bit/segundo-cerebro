import { useEffect, useRef, useState } from "react";
import { sendAssistantMessage, transcribeAudio } from "../api";

// Modo mãos-livres ("modo luva"): durante o atendimento, de luvas, sem tocar na
// tela. Escuta o microfone em blocos curtos, transcreve LOCALMENTE (Whisper no
// servidor — o áudio nunca vai para a nuvem), espera a palavra de ativação
// ("Cérebro" ou "assistente"), manda o comando ao assistente e FALA a resposta
// (síntese de voz local do navegador) — assim você não precisa olhar.
const WAKE_WORDS = ["cérebro", "cerebro", "assistente"];
const CHUNK_MS = 3500;

export function GloveMode() {
  const [active, setActive] = useState(false);
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState<"ouvindo" | "pensando" | "falando">("ouvindo");
  const [error, setError] = useState<string | null>(null);

  const activeRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const armedRef = useRef(false); // ouviu a palavra de ativação, esperando o comando
  const speakingRef = useRef(false);
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof window !== "undefined" && "MediaRecorder" in window;

  useEffect(() => () => stopListening(), []);

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    try {
      speakingRef.current = true;
      setStatus("falando");
      const u = new SpeechSynthesisUtterance(text);
      const pt = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("pt"));
      if (pt) u.voice = pt;
      u.lang = "pt-BR";
      u.onend = () => {
        speakingRef.current = false;
        if (activeRef.current) setStatus("ouvindo");
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      speakingRef.current = false;
    }
  }

  async function processCommand(command: string) {
    armedRef.current = false;
    setStatus("pensando");
    try {
      const { reply } = await sendAssistantMessage(command);
      setReply(reply);
      speak(reply);
    } catch {
      setError("Falha ao consultar o assistente.");
      if (activeRef.current) setStatus("ouvindo");
    }
  }

  function handleTranscript(raw: string) {
    const text = raw.trim();
    if (!text || speakingRef.current) return;
    const lower = text.toLowerCase();

    // Já ouviu "Cérebro" antes e este bloco é o comando.
    if (armedRef.current) {
      setHeard(text);
      processCommand(text);
      return;
    }
    const hit = WAKE_WORDS.find((w) => lower.includes(w));
    if (!hit) return;
    setHeard(text);
    const after = text.slice(lower.indexOf(hit) + hit.length).replace(/^[\s,.:!?]+/, "").trim();
    if (after.length >= 3) {
      processCommand(after); // comando veio junto: "Cérebro, qual a dose de amoxicilina"
    } else {
      armedRef.current = true; // só chamou: captura o próximo bloco como comando
      setReply("Estou ouvindo…");
    }
  }

  function recordChunk() {
    if (!activeRef.current || !streamRef.current) return;
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(streamRef.current);
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      // próximo bloco já começa enquanto transcrevemos este
      recordChunk();
      if (blob.size < 1200 || speakingRef.current) return; // bloco vazio/silêncio
      try {
        const { text } = await transcribeAudio(blob);
        handleTranscript(text);
      } catch {
        /* ignora falha de bloco isolado */
      }
    };
    rec.start();
    setTimeout(() => rec.state !== "inactive" && rec.stop(), CHUNK_MS);
  }

  async function startListening() {
    setError(null);
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeRef.current = true;
      setActive(true);
      setStatus("ouvindo");
      setReply("");
      setHeard("");
      recordChunk();
    } catch {
      setError("Não foi possível acessar o microfone.");
    }
  }

  function stopListening() {
    activeRef.current = false;
    armedRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setActive(false);
  }

  if (!supported) return null;

  const dotColor = status === "pensando" ? "#FF9500" : status === "falando" ? "#0FB5A8" : "#FF3B30";

  return (
    <div style={{ position: "fixed", left: 20, bottom: 20, zIndex: 55, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
      {active && (
        <div style={{ background: "rgba(20,20,20,0.95)", color: "#eee", borderRadius: 14, padding: "12px 14px", width: 300, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", border: "1px solid #333" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor, animation: "pulse 1.2s infinite" }} />
            <strong style={{ fontSize: 13 }}>
              {status === "ouvindo" ? "Ouvindo — diga “Cérebro, …”" : status === "pensando" ? "Pensando…" : "Respondendo…"}
            </strong>
          </div>
          {heard && <div style={{ fontSize: 12, color: "#9ad" }}>“{heard}”</div>}
          {reply && <div style={{ fontSize: 13, marginTop: 6, whiteSpace: "pre-wrap" }}>{reply}</div>}
          {error && <div style={{ fontSize: 12, color: "#FF3B30", marginTop: 6 }}>{error}</div>}
          <div style={{ fontSize: 10, color: "#888", marginTop: 8 }}>Áudio processado localmente (Whisper). Nada vai para a nuvem.</div>
        </div>
      )}
      <button
        onClick={() => (active ? stopListening() : startListening())}
        title="Modo mãos-livres por voz (para usar de luvas)"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: active ? "#FF3B30" : "rgba(20,20,20,0.9)",
          color: "#fff",
          border: "1px solid #444",
          borderRadius: 999,
          padding: "10px 16px",
          fontSize: 14,
          cursor: "pointer",
          boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
        }}
      >
        🧤 {active ? "Parar modo luva" : "Modo luva"}
      </button>
      <style>{`@keyframes pulse{0%{opacity:1}50%{opacity:0.3}100%{opacity:1}}`}</style>
    </div>
  );
}
