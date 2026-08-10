import { useRef, useState } from "react";
import { transcribeAudio } from "./api";

export function useVoiceRecorder(onTranscribed: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = handleStop;
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Não foi possível acessar o microfone.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function handleStop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    setTranscribing(true);
    try {
      const { text } = await transcribeAudio(blob);
      onTranscribed(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao transcrever áudio.");
    } finally {
      setTranscribing(false);
    }
  }

  return { recording, transcribing, error, start, stop };
}
