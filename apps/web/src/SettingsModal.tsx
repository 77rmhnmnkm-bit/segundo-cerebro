import { useEffect, useState } from "react";
import { GlassModal } from "./GlassModal";
import { useTheme } from "./ThemeProvider";
import { TextField } from "./FormField";
import { getSetting, putSetting, putBaseAddress, exportTrainingDataset } from "./api";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const [supervisorEnabled, setSupervisorEnabled] = useState(false);
  const [teacherModeEnabled, setTeacherModeEnabled] = useState(true);
  const [professionalName, setProfessionalName] = useState("");
  const [professionalCro, setProfessionalCro] = useState("");
  const [baseAddress, setBaseAddress] = useState("");
  const [baseAddressStatus, setBaseAddressStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [baseAddressResolved, setBaseAddressResolved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  async function runExport() {
    setExporting(true);
    setExportMsg(null);
    try {
      const r = await exportTrainingDataset();
      if (r.imageCount === 0) {
        setExportMsg(r.message ?? "Nenhuma confirmação ainda.");
      } else {
        const byClass = Object.entries(r.byClass).map(([k, v]) => `${k} ×${v}`).join(", ");
        setExportMsg(`✓ ${r.imageCount} imagem(ns), ${r.labelCount} marcação(ões) [${byClass}]. Salvo em: ${r.path}`);
      }
    } catch (err) {
      setExportMsg(err instanceof Error ? err.message : "Falha ao exportar.");
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    Promise.all([
      getSetting("supervisor_confirmation_enabled").catch(() => null),
      getSetting("teacher_mode_enabled").catch(() => null),
      getSetting("professional_name").catch(() => null),
      getSetting("professional_cro").catch(() => null),
      getSetting("base_address").catch(() => null),
      getSetting("base_address_coords").catch(() => null),
    ]).then(([supervisor, teacherMode, name, cro, address, coords]) => {
      if (supervisor) setSupervisorEnabled(Boolean(supervisor.setting.value));
      if (teacherMode) setTeacherModeEnabled(teacherMode.setting.value !== false);
      if (name) setProfessionalName(String(name.setting.value ?? ""));
      if (cro) setProfessionalCro(String(cro.setting.value ?? ""));
      if (address) setBaseAddress(String(address.setting.value ?? ""));
      const coordsValue = coords?.setting.value as { displayName: string } | null;
      if (coordsValue) setBaseAddressResolved(coordsValue.displayName);
      setLoading(false);
    });
  }, []);

  async function saveBaseAddress() {
    if (!baseAddress.trim()) return;
    setBaseAddressStatus("saving");
    try {
      const { coords } = await putBaseAddress(baseAddress.trim());
      setBaseAddressResolved(coords.displayName);
      setBaseAddressStatus("saved");
    } catch {
      setBaseAddressStatus("error");
    }
  }

  async function toggle(value: boolean) {
    setSupervisorEnabled(value);
    await putSetting("supervisor_confirmation_enabled", value);
  }

  async function toggleTeacherMode(value: boolean) {
    setTeacherModeEnabled(value);
    await putSetting("teacher_mode_enabled", value);
  }

  async function saveProfessionalName(value: string) {
    setProfessionalName(value);
    await putSetting("professional_name", value);
  }

  async function saveProfessionalCro(value: string) {
    setProfessionalCro(value);
    await putSetting("professional_cro", value);
  }

  return (
    <GlassModal title="Configurações" onClose={onClose}>
      {loading ? (
        <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>Carregando...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.lg }}>
          <div>
            <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary, fontWeight: theme.typography.weights.medium, marginBottom: theme.spacing.sm }}>
              Dados para receituário e documentos impressos
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
              <TextField label="Nome do profissional" value={professionalName} onChange={saveProfessionalName} />
              <TextField label="CRO" value={professionalCro} onChange={saveProfessionalCro} placeholder="Ex: CRO-SP 12345" />
            </div>
          </div>

          <div>
            <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary, fontWeight: theme.typography.weights.medium, marginBottom: theme.spacing.sm }}>
              Endereço de partida (consultório/casa)
            </div>
            <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }}>
              Usado para calcular automaticamente o tempo de deslocamento até cada compromisso.
            </div>
            <div style={{ display: "flex", gap: theme.spacing.sm, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <TextField label="Endereço" value={baseAddress} onChange={setBaseAddress} placeholder="Rua, número, cidade" />
              </div>
              <button
                onClick={saveBaseAddress}
                disabled={baseAddressStatus === "saving" || !baseAddress.trim()}
                style={{
                  background: theme.colors.primary,
                  color: "#fff",
                  border: "none",
                  borderRadius: theme.radius.sm,
                  padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
                  fontSize: theme.typography.sizes.sm,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {baseAddressStatus === "saving" ? "Localizando..." : "Confirmar"}
              </button>
            </div>
            {baseAddressStatus === "saved" && baseAddressResolved && (
              <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.primary, marginTop: 4 }}>
                ✓ Localizado: {baseAddressResolved}
              </div>
            )}
            {baseAddressStatus === "error" && (
              <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.danger, marginTop: 4 }}>
                Não consegui localizar esse endereço. Tente ser mais específico (rua, número, cidade).
              </div>
            )}
          </div>

          <label style={{ display: "flex", alignItems: "flex-start", gap: theme.spacing.sm, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={supervisorEnabled}
              onChange={(e) => toggle(e.target.checked)}
              style={{ accentColor: theme.colors.primary, marginTop: 3 }}
            />
            <div>
              <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary, fontWeight: theme.typography.weights.medium }}>
                Confirmação docente nos casos clínicos
              </div>
              <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
                Quando ativado, cada caso clínico ganha um campo para o nome do professor supervisor.
              </div>
            </div>
          </label>

          <label style={{ display: "flex", alignItems: "flex-start", gap: theme.spacing.sm, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={teacherModeEnabled}
              onChange={(e) => toggleTeacherMode(e.target.checked)}
              style={{ accentColor: theme.colors.primary, marginTop: 3 }}
            />
            <div>
              <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary, fontWeight: theme.typography.weights.medium }}>
                Modo professora na calculadora
              </div>
              <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
                Mostra o passo a passo da conta. Desative quando precisar do resultado rápido, sem explicação.
              </div>
            </div>
          </label>

          <div>
            <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary, fontWeight: theme.typography.weights.medium, marginBottom: theme.spacing.sm }}>
              IA · Treinar com suas confirmações
            </div>
            <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }}>
              Gera um conjunto de treino (YOLO) com os achados que você confirmou (✓) no negatoscópio, para um fine-tune local do detector. As imagens são suas — fica tudo na máquina.
            </div>
            <button
              onClick={runExport}
              disabled={exporting}
              style={{ background: theme.colors.primary, color: "#fff", border: "none", borderRadius: theme.radius.sm, padding: `${theme.spacing.sm}px ${theme.spacing.md}px`, fontSize: theme.typography.sizes.sm, cursor: "pointer" }}
            >
              {exporting ? "Exportando..." : "Exportar dataset de treino"}
            </button>
            {exportMsg && <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginTop: theme.spacing.sm, wordBreak: "break-word" }}>{exportMsg}</div>}
          </div>
        </div>
      )}
    </GlassModal>
  );
}
