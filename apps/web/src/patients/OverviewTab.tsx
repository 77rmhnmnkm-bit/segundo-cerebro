import { useState } from "react";
import type { Patient } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { TextField, PrimaryButton } from "../FormField";
import { updatePatient } from "../api";

export function OverviewTab({ patient, onUpdated }: { patient: Patient; onUpdated: (p: Patient) => void }) {
  const { theme } = useTheme();
  const [phone, setPhone] = useState(patient.phone ?? "");
  const [email, setEmail] = useState(patient.email ?? "");
  const [birthDate, setBirthDate] = useState(patient.birth_date?.slice(0, 10) ?? "");
  const [cpf, setCpf] = useState(patient.cpf ?? "");
  const [address, setAddress] = useState(patient.address ?? "");
  const [notes, setNotes] = useState(patient.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const { patient: updated } = await updatePatient(patient.id, {
        phone: phone || undefined,
        email: email || undefined,
        birthDate: birthDate || undefined,
        cpf: cpf || undefined,
        address: address || undefined,
        notes: notes || undefined,
      });
      onUpdated(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...glassSurface(theme), padding: theme.spacing.lg, display: "flex", flexDirection: "column", gap: theme.spacing.md, maxWidth: 480 }}>
      <TextField label="Telefone" value={phone} onChange={setPhone} />
      <TextField label="E-mail" value={email} onChange={setEmail} type="email" />
      <TextField label="Data de nascimento" value={birthDate} onChange={setBirthDate} type="date" />
      <TextField label="CPF" value={cpf} onChange={setCpf} />
      <TextField label="Endereço" value={address} onChange={setAddress} />
      <TextField label="Observações" value={notes} onChange={setNotes} voice />
      <PrimaryButton onClick={handleSave} disabled={saving}>
        {saving ? "Salvando..." : "Salvar alterações"}
      </PrimaryButton>
    </div>
  );
}
