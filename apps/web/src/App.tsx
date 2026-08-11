import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import type { User } from "@app/core";
import { ThemeProvider } from "./ThemeProvider";
import { AmbientBackground } from "./AmbientBackground";
import { LoginScreen } from "./LoginScreen";
import { Dashboard } from "./Dashboard";
import { InventoryScreen } from "./inventory/InventoryScreen";
import { EstoqueScreen } from "./estoque/EstoqueScreen";
import { AgendaScreen } from "./agenda/AgendaScreen";
import { PatientsScreen } from "./patients/PatientsScreen";
import { PatientDetailScreen } from "./patients/PatientDetailScreen";
import { LibraryScreen } from "./library/LibraryScreen";
import { FinanceScreen } from "./finance/FinanceScreen";
import { FloatingAssistant } from "./assistant/FloatingAssistant";
import { GloveMode } from "./assistant/GloveMode";
import { HabitsScreen } from "./habits/HabitsScreen";
import { KnowledgeScreen } from "./knowledge/KnowledgeScreen";
import { SterilizationScreen } from "./sterilization/SterilizationScreen";
import { devBypassLogin, getToken, me, setToken, setupStatus } from "./api";

type Status = "loading" | "needs-setup" | "needs-login" | "authenticated";

export function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);

  async function checkSession() {
    const token = getToken();
    if (!token) {
      // Only succeeds while the server has DEV_SKIP_AUTH=true; otherwise
      // falls through to the normal login/setup flow below untouched.
      try {
        const bypass = await devBypassLogin();
        setToken(bypass.token, true);
        setUser(bypass.user);
        setStatus("authenticated");
        return;
      } catch {
        // bypass disabled — continue to real auth flow
      }
      try {
        const { needsSetup } = await setupStatus();
        setStatus(needsSetup ? "needs-setup" : "needs-login");
      } catch {
        setStatus("needs-login");
      }
      return;
    }
    try {
      const { user } = await me();
      setUser(user);
      setStatus("authenticated");
    } catch {
      setStatus("needs-login");
    }
  }

  useEffect(() => {
    checkSession();
  }, []);

  return (
    <ThemeProvider>
      <AmbientBackground />
      {status === "loading" && null}
      {(status === "needs-login" || status === "needs-setup") && (
        <LoginScreen isFirstRun={status === "needs-setup"} onAuthenticated={checkSession} />
      )}
      {status === "authenticated" && user && (
        <Routes>
          <Route path="/" element={<Dashboard user={user} onLoggedOut={() => setStatus("needs-login")} />} />
          <Route path="/estoque" element={<EstoqueScreen />} />
          <Route path="/estoque-pessoal" element={<InventoryScreen />} />
          <Route path="/agenda" element={<AgendaScreen />} />
          <Route path="/pacientes" element={<PatientsScreen />} />
          <Route path="/pacientes/:id" element={<PatientDetailScreen />} />
          <Route path="/biblioteca" element={<LibraryScreen />} />
          <Route path="/financeiro" element={<FinanceScreen />} />
          <Route path="/habitos" element={<HabitsScreen />} />
          <Route path="/notas" element={<KnowledgeScreen />} />
          <Route path="/esterilizacao" element={<SterilizationScreen />} />
        </Routes>
      )}
      {status === "authenticated" && user && <FloatingAssistant />}
      {status === "authenticated" && user && <GloveMode />}
    </ThemeProvider>
  );
}
