import { useEffect, useState } from "react";
import type { PatientFile } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { API_URL, deletePatientFile, listPatientFiles, uploadPatientFile } from "../api";
import { RadiographViewer } from "./RadiographViewer";
import { RadiographCompare } from "./RadiographCompare";

const RTYPE_LABEL: Record<string, string> = { panoramica: "Panorâmica", bitewing: "Bitewing", periapical: "Periapical", foto: "Foto" };

export function FilesTab({ patientId }: { patientId: string }) {
  const { theme } = useTheme();
  const [files, setFiles] = useState<PatientFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<PatientFile | null>(null);
  const [comparing, setComparing] = useState(false);
  const imageCount = files.filter((f) => f.format === "image").length;

  async function refresh() {
    const { files } = await listPatientFiles(patientId);
    setFiles(files);
  }

  useEffect(() => {
    refresh();
  }, [patientId]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      await uploadPatientFile(patientId, file);
      refresh();
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    await deletePatientFile(id);
    refresh();
  }

  return (
    <div>
      <label
        style={{
          ...glassSurface(theme),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: theme.spacing.sm,
          border: `1px dashed ${theme.glass.borderSoft}`,
          padding: theme.spacing.md,
          color: theme.colors.textSecondary,
          fontSize: theme.typography.sizes.sm,
          cursor: uploading ? "default" : "pointer",
          marginBottom: theme.spacing.lg,
        }}
      >
        {uploading ? "Enviando..." : "📎 Enviar foto, exame ou radiografia (JPG, PNG, PDF)"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
      </label>

      {imageCount >= 2 && (
        <button
          onClick={() => setComparing(true)}
          style={{
            ...glassSurface(theme, { radius: theme.radius.md }),
            border: "none",
            padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
            color: theme.colors.primary,
            fontSize: theme.typography.sizes.sm,
            cursor: "pointer",
            marginBottom: theme.spacing.md,
          }}
        >
          🕐 Comparar no tempo ({imageCount} imagens)
        </button>
      )}

      {files.length === 0 && (
        <div style={{ color: theme.colors.textSecondary, textAlign: "center" }}>Nenhum arquivo enviado ainda.</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: theme.spacing.sm }}>
        {files.map((file) => (
          <div key={file.id} style={{ ...glassSurface(theme, { radius: theme.radius.md }), padding: theme.spacing.sm }}>
            {file.format === "image" ? (
              <div style={{ position: "relative" }}>
                <img
                  src={`${API_URL}${file.file_path}`}
                  alt={file.label ?? ""}
                  onClick={() => setViewing(file)}
                  style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: theme.radius.sm, cursor: "zoom-in" }}
                />
                {file.annotations && file.annotations.length > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      background: theme.colors.primary,
                      color: "#fff",
                      fontSize: 10,
                      padding: "1px 6px",
                      borderRadius: 999,
                    }}
                  >
                    ✦ {file.annotations.length}
                  </span>
                )}
                {file.radiograph_type && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: 4,
                      left: 4,
                      background: "rgba(0,0,0,0.6)",
                      color: "#fff",
                      fontSize: 10,
                      padding: "1px 6px",
                      borderRadius: 999,
                    }}
                  >
                    {RTYPE_LABEL[file.radiograph_type] ?? file.radiograph_type}
                  </span>
                )}
              </div>
            ) : (
              <div
                style={{
                  width: "100%",
                  height: 110,
                  borderRadius: theme.radius.sm,
                  background: theme.glass.surfaceStrong,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: theme.typography.sizes.xs,
                  color: theme.colors.textSecondary,
                }}
              >
                {file.format === "dicom" ? "DICOM" : "PDF"}
              </div>
            )}
            <div
              style={{
                fontSize: theme.typography.sizes.xs,
                color: theme.colors.textSecondary,
                marginTop: 4,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.label}</span>
              <button onClick={() => handleDelete(file.id)} style={{ background: "none", border: "none", color: theme.colors.textSecondary, cursor: "pointer" }}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {viewing && <RadiographViewer file={viewing} onClose={() => setViewing(null)} onSaved={refresh} />}
      {comparing && <RadiographCompare files={files} onClose={() => setComparing(false)} />}
    </div>
  );
}
