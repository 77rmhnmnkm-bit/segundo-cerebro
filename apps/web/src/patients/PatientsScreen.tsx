import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Patient } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { GlassModal } from "../GlassModal";
import { TextField, PrimaryButton } from "../FormField";
import { createPatient, listPatients } from "../api";

export function PatientsScreen() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  async function refresh(query?: string) {
    setLoading(true);
    try {
      const { patients } = await listPatients(query);
      setPatients(patients);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => refresh(search || undefined), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function handleCreate() {
    if (!name.trim()) return;
    const { patient } = await createPatient({ name: name.trim(), phone: phone || undefined });
    setName("");
    setPhone("");
    setShowForm(false);
    navigate(`/pacientes/${patient.id}`);
  }

  return (
    <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", padding: theme.spacing.xl }}>
      <header
        style={{
          ...glassSurface(theme, { radius: theme.radius.lg }),
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: theme.spacing.md,
          padding: `${theme.spacing.md}px ${theme.spacing.lg}px`,
          marginBottom: theme.spacing.xl,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.md }}>
          <button
            onClick={() => navigate("/")}
            aria-label="Voltar"
            style={{ border: "none", background: "transparent", color: theme.colors.textSecondary, fontSize: theme.typography.sizes.lg, cursor: "pointer" }}
          >
            ←
          </button>
          <div>
            <div
              style={{
                fontSize: theme.typography.sizes.xl,
                fontWeight: theme.typography.weights.bold,
                letterSpacing: theme.typography.tracking.tight,
                color: theme.colors.textPrimary,
              }}
            >
              Pacientes
            </div>
            <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>
              Prontuário, arquivos e odontograma.
            </div>
          </div>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar paciente..."
          style={{
            background: theme.mode === "light" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.06)",
            border: `1px solid ${theme.glass.borderSoft}`,
            borderRadius: theme.radius.sm,
            padding: `${theme.spacing.xs + 2}px ${theme.spacing.sm}px`,
            fontSize: theme.typography.sizes.sm,
            color: theme.colors.textPrimary,
            outline: "none",
            width: 220,
          }}
        />
      </header>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: theme.spacing.md }}>
        <PrimaryButton onClick={() => setShowForm(true)}>+ Novo paciente</PrimaryButton>
      </div>

      {loading && <div style={{ color: theme.colors.textSecondary }}>Carregando...</div>}

      {!loading && patients.length === 0 && (
        <div style={{ ...glassSurface(theme), padding: theme.spacing.lg, color: theme.colors.textSecondary, textAlign: "center" }}>
          Nenhum paciente cadastrado ainda.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
        {patients.map((p) => (
          <div
            key={p.id}
            onClick={() => navigate(`/pacientes/${p.id}`)}
            style={{
              ...glassSurface(theme),
              padding: theme.spacing.md,
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>{p.name}</div>
              <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary }}>
                {p.phone ?? "Sem telefone cadastrado"}
              </div>
            </div>
            <span style={{ color: theme.colors.textSecondary }}>→</span>
          </div>
        ))}
      </div>

      {showForm && (
        <GlassModal title="Novo paciente" onClose={() => setShowForm(false)}>
          <TextField label="Nome" value={name} onChange={setName} required />
          <TextField label="Telefone" value={phone} onChange={setPhone} />
          <PrimaryButton onClick={handleCreate} disabled={!name.trim()}>
            Criar paciente
          </PrimaryButton>
        </GlassModal>
      )}
    </div>
  );
}
