import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SterilizationCycle, BiologicalIndicatorTest, SterilizationStatus } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { TextField, SelectField, PrimaryButton } from "../FormField";
import {
  listSterilizationCycles,
  createSterilizationCycle,
  deleteSterilizationCycle,
  listBiTests,
  createBiTest,
  getSterilizationStatus,
} from "../api";

const CHEM = [
  { value: "ok", label: "Integrador químico: OK" },
  { value: "fail", label: "Integrador químico: FALHOU" },
  { value: "na", label: "Integrador químico: não usado" },
] as const;
const BIO = [
  { value: "na", label: "Indicador biológico: não aplicável" },
  { value: "pending", label: "Indicador biológico: em leitura" },
  { value: "pass", label: "Indicador biológico: aprovado" },
  { value: "fail", label: "Indicador biológico: FALHOU" },
] as const;

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function printLabel(c: SterilizationCycle) {
  const row = (k: string, v: string) => `<tr><td style="color:#555;padding:2px 10px 2px 0;white-space:nowrap">${k}</td><td style="font-weight:600">${v}</td></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta ${c.lot_number}</title>
  <style>@page{margin:8mm} body{font-family:-apple-system,Arial,sans-serif;color:#111}
  .label{border:2px solid #111;border-radius:8px;padding:14px 18px;width:320px}
  h3{margin:0 0 8px;font-size:15px;letter-spacing:.5px}</style></head>
  <body><div class="label">
    <h3>ESTERILIZAÇÃO — ${c.lot_number}</h3>
    <table style="font-size:13px">
      ${row("Esterilizado em", fmtDateTime(c.sterilized_at))}
      ${row("Autoclave / Ciclo", `${c.autoclave}${c.cycle_number ? " / " + c.cycle_number : ""}`)}
      ${row("Lote", c.lot_number)}
      ${c.material_type ? row("Conteúdo", c.material_type) : ""}
      ${row("Operador", c.operator)}
      ${row("Integrador químico", c.chemical_indicator.toUpperCase())}
      ${row("Indicador biológico", c.biological_indicator)}
      ${c.has_implant ? row("Carga com implante", "SIM — exige IB") : ""}
    </table>
    <div style="font-size:10px;color:#777;margin-top:8px">Conforme RDC nº 1.002/2025. Não usar se a embalagem estiver violada/úmida.</div>
  </div><script>print();</script></body></html>`;
  const w = window.open("", "_blank", "width=420,height=520");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

export function SterilizationScreen() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [cycles, setCycles] = useState<SterilizationCycle[]>([]);
  const [tests, setTests] = useState<BiologicalIndicatorTest[]>([]);
  const [status, setStatus] = useState<SterilizationStatus | null>(null);

  const [c, setC] = useState({ autoclave: "", cycleNumber: "", materialType: "", operator: "", chemicalIndicator: "ok", biologicalIndicator: "na", hasImplant: false, notes: "" });
  const [bi, setBi] = useState({ autoclave: "", result: "pass", notes: "" });

  async function refresh() {
    const [{ cycles }, { tests }, st] = await Promise.all([listSterilizationCycles(), listBiTests(), getSterilizationStatus()]);
    setCycles(cycles);
    setTests(tests);
    setStatus(st);
  }
  useEffect(() => {
    refresh();
  }, []);

  async function addCycle() {
    if (!c.autoclave.trim() || !c.operator.trim()) return;
    await createSterilizationCycle({
      autoclave: c.autoclave.trim(),
      cycleNumber: c.cycleNumber.trim() || undefined,
      materialType: c.materialType.trim() || undefined,
      operator: c.operator.trim(),
      chemicalIndicator: c.chemicalIndicator as "ok" | "fail" | "na",
      biologicalIndicator: c.biologicalIndicator as "na" | "pending" | "pass" | "fail",
      hasImplant: c.hasImplant,
      notes: c.notes.trim() || undefined,
    });
    setC({ ...c, cycleNumber: "", materialType: "", notes: "", hasImplant: false });
    refresh();
  }
  async function addBi() {
    if (!bi.autoclave.trim()) return;
    await createBiTest({ autoclave: bi.autoclave.trim(), result: bi.result as "pending" | "pass" | "fail", notes: bi.notes.trim() || undefined });
    setBi({ ...bi, notes: "" });
    refresh();
  }
  async function removeCycle(id: string) {
    if (!confirm("Remover este registro de ciclo?")) return;
    await deleteSterilizationCycle(id);
    refresh();
  }

  const banner = (() => {
    if (!status) return null;
    if (status.openFails > 0) return { color: theme.colors.danger, text: `⚠ ${status.openFails} falha(s) registrada(s) (indicador químico/biológico). Reprocesse e investigue antes de usar.` };
    if (status.biOverdue) return { color: theme.colors.danger, text: status.lastBiDate ? `⚠ Indicador biológico atrasado — último há ${status.daysSinceBi} dias. O teste é obrigatório no mínimo semanal.` : "⚠ Nenhum indicador biológico registrado. O teste é obrigatório no mínimo semanal." };
    return { color: theme.colors.primary, text: `✓ Em dia — último indicador biológico ${status.lastBiResult === "pass" ? "aprovado" : status.lastBiResult} há ${status.daysSinceBi} dia(s). ${status.cyclesThisWeek} ciclo(s) na semana.` };
  })();

  const pill = (text: string, ok: boolean) => (
    <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 999, background: ok ? "#0FB5A822" : "#FF3B3022", color: ok ? "#0a8" : "#c0392b" }}>{text}</span>
  );

  return (
    <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", padding: theme.spacing.xl }}>
      <header style={{ ...glassSurface(theme, { radius: theme.radius.lg }), display: "flex", alignItems: "center", gap: theme.spacing.md, padding: `${theme.spacing.md}px ${theme.spacing.lg}px`, marginBottom: theme.spacing.lg }}>
        <button onClick={() => navigate("/")} aria-label="Voltar" style={{ border: "none", background: "transparent", color: theme.colors.textSecondary, fontSize: theme.typography.sizes.lg, cursor: "pointer" }}>←</button>
        <div>
          <div style={{ fontSize: theme.typography.sizes.xl, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary }}>Esterilização</div>
          <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>Rastreabilidade de ciclos e indicador biológico — RDC nº 1.002/2025.</div>
        </div>
      </header>

      {banner && (
        <div style={{ ...glassSurface(theme, { radius: theme.radius.md }), padding: theme.spacing.md, marginBottom: theme.spacing.lg, borderLeft: `4px solid ${banner.color}`, color: theme.colors.textPrimary, fontSize: theme.typography.sizes.sm }}>
          {banner.text}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: theme.spacing.lg, alignItems: "start" }}>
        {/* Ciclos */}
        <div style={{ ...glassSurface(theme, { radius: theme.radius.md }), padding: theme.spacing.lg }}>
          <div style={{ fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>Registrar ciclo</div>
          <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
            <div style={{ display: "flex", gap: theme.spacing.sm }}>
              <div style={{ flex: 1 }}><TextField label="Autoclave" value={c.autoclave} onChange={(v) => setC({ ...c, autoclave: v })} placeholder="ex.: Autoclave 1" /></div>
              <div style={{ width: 110 }}><TextField label="Ciclo nº" value={c.cycleNumber} onChange={(v) => setC({ ...c, cycleNumber: v })} placeholder="ex.: 12" /></div>
            </div>
            <TextField label="Conteúdo / tipo de material" value={c.materialType} onChange={(v) => setC({ ...c, materialType: v })} placeholder="ex.: Caixa de exodontia" />
            <TextField label="Operador" value={c.operator} onChange={(v) => setC({ ...c, operator: v })} placeholder="Quem processou" />
            <SelectField label="Monitoramento químico" value={c.chemicalIndicator} onChange={(v) => setC({ ...c, chemicalIndicator: v })} options={CHEM.map((o) => ({ value: o.value, label: o.label }))} />
            <SelectField label="Monitoramento biológico" value={c.biologicalIndicator} onChange={(v) => setC({ ...c, biologicalIndicator: v })} options={BIO.map((o) => ({ value: o.value, label: o.label }))} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.colors.textSecondary, cursor: "pointer" }}>
              <input type="checkbox" checked={c.hasImplant} onChange={(e) => setC({ ...c, hasImplant: e.target.checked })} style={{ accentColor: theme.colors.primary }} />
              Carga com implante (exige indicador biológico)
            </label>
            <PrimaryButton onClick={addCycle}>Registrar ciclo</PrimaryButton>
          </div>

          <div style={{ marginTop: theme.spacing.lg, display: "flex", flexDirection: "column", gap: theme.spacing.sm, maxHeight: "44vh", overflowY: "auto" }}>
            {cycles.length === 0 && <div style={{ color: theme.colors.textSecondary, fontSize: 13 }}>Nenhum ciclo registrado.</div>}
            {cycles.map((cy) => (
              <div key={cy.id} style={{ border: `1px solid ${theme.glass.borderSoft}`, borderRadius: theme.radius.sm, padding: theme.spacing.sm }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, color: theme.colors.textPrimary, fontSize: 13 }}>{cy.lot_number}</span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button onClick={() => printLabel(cy)} title="Imprimir etiqueta" style={{ border: "none", background: "transparent", cursor: "pointer", color: theme.colors.primary, fontSize: 13 }}>🖨 Etiqueta</button>
                    <button onClick={() => removeCycle(cy.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: theme.colors.textSecondary }}>✕</button>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: theme.colors.textSecondary }}>{fmtDateTime(cy.sterilized_at)} · {cy.autoclave}{cy.cycle_number ? ` /${cy.cycle_number}` : ""} · {cy.operator}{cy.material_type ? ` · ${cy.material_type}` : ""}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  {pill(`Quím: ${cy.chemical_indicator}`, cy.chemical_indicator !== "fail")}
                  {pill(`Biol: ${cy.biological_indicator}`, cy.biological_indicator !== "fail")}
                  {cy.has_implant && pill("Implante", true)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Indicador biológico semanal */}
        <div style={{ ...glassSurface(theme, { radius: theme.radius.md }), padding: theme.spacing.lg }}>
          <div style={{ fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>Indicador biológico (semanal)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
            <TextField label="Autoclave" value={bi.autoclave} onChange={(v) => setBi({ ...bi, autoclave: v })} placeholder="ex.: Autoclave 1" />
            <SelectField label="Resultado" value={bi.result} onChange={(v) => setBi({ ...bi, result: v })} options={[{ value: "pass", label: "Aprovado" }, { value: "fail", label: "FALHOU" }, { value: "pending", label: "Em leitura" }]} />
            <TextField label="Observações (opcional)" value={bi.notes} onChange={(v) => setBi({ ...bi, notes: v })} />
            <PrimaryButton onClick={addBi}>Registrar teste</PrimaryButton>
          </div>

          <div style={{ marginTop: theme.spacing.lg, display: "flex", flexDirection: "column", gap: 6, maxHeight: "44vh", overflowY: "auto" }}>
            {tests.length === 0 && <div style={{ color: theme.colors.textSecondary, fontSize: 13 }}>Nenhum teste registrado.</div>}
            {tests.map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${theme.glass.borderSoft}`, borderRadius: theme.radius.sm, padding: `${theme.spacing.xs}px ${theme.spacing.sm}px` }}>
                <span style={{ fontSize: 13, color: theme.colors.textPrimary }}>{new Date(t.tested_at).toLocaleDateString("pt-BR")} · {t.autoclave}</span>
                {pill(t.result === "pass" ? "Aprovado" : t.result === "fail" ? "FALHOU" : "Em leitura", t.result !== "fail")}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
