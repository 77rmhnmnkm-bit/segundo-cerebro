import { useState } from "react";
import type { OdontogramEntry, ToothFace, ToothStatus } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";

// Healthy stays almost invisible (a clean tooth shouldn't draw attention);
// only actual findings get a saturated, semi-transparent tint so the glass
// behind still reads through, instead of a flat opaque fill.
const STATUS_FILL: Record<ToothStatus, string> = {
  saudavel: "transparent",
  carie: "rgba(139, 90, 66, 0.55)",
  restaurado: "rgba(79, 143, 232, 0.55)",
  ausente: "rgba(156, 154, 149, 0.5)",
  implante: "rgba(118, 128, 140, 0.55)",
  endodontia: "rgba(149, 121, 201, 0.55)",
};

// FDI quadrants: 1=upper right, 2=upper left, 3=lower left, 4=lower right.
// Mesial always means "toward the midline", so which physical side of the
// tooth icon is mesial vs distal flips between the two halves of each arch —
// it isn't fixed, which was the bug. Vestibular/lingual also flips: upper
// teeth show vestibular on top + palatina (stored as "lingual") on bottom;
// lower teeth are mirrored.
function getOrientation(tooth: number) {
  const quadrant = Math.floor(tooth / 10);
  const isUpper = quadrant === 1 || quadrant === 2;
  const mesialOnRight = quadrant === 1 || quadrant === 4;
  return { isUpper, mesialOnRight };
}

function getFaceLayout(tooth: number): { key: ToothFace; path: string }[] {
  const { isUpper, mesialOnRight } = getOrientation(tooth);
  const topFace: ToothFace = isUpper ? "vestibular" : "lingual";
  const bottomFace: ToothFace = isUpper ? "lingual" : "vestibular";
  const leftFace: ToothFace = mesialOnRight ? "distal" : "mesial";
  const rightFace: ToothFace = mesialOnRight ? "mesial" : "distal";

  return [
    { key: topFace, path: "0,0 40,0 20,20" },
    { key: rightFace, path: "40,0 40,40 20,20" },
    { key: bottomFace, path: "40,40 0,40 20,20" },
    { key: leftFace, path: "0,40 0,0 20,20" },
  ];
}

export function faceLabel(tooth: number, face: ToothFace): string {
  if (face === "lingual") return getOrientation(tooth).isUpper ? "Palatina" : "Lingual";
  if (face === "vestibular") return "Vestibular";
  if (face === "mesial") return "Mesial";
  if (face === "distal") return "Distal";
  return "Oclusal/Incisal";
}

// Most-recent-entry-wins per face; an entry with no face applies to the
// whole tooth (e.g. "ausente"/"implante"), then specific faces override it.
export function computeFaceStatus(entries: OdontogramEntry[]): Record<ToothFace, ToothStatus> {
  const sorted = [...entries].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
  const wholeTooth = sorted.find((e) => !e.face);
  const base: ToothStatus = wholeTooth ? wholeTooth.status : "saudavel";

  const statuses: Record<ToothFace, ToothStatus> = {
    vestibular: base,
    lingual: base,
    mesial: base,
    distal: base,
    oclusal: base,
  };

  for (const face of ["vestibular", "lingual", "mesial", "distal", "oclusal"] as ToothFace[]) {
    const entry = sorted.find((e) => e.face === face);
    if (entry) statuses[face] = entry.status;
  }

  return statuses;
}

export function Tooth({
  number,
  entries,
  onSelect,
}: {
  number: number;
  entries: OdontogramEntry[];
  onSelect: (tooth: number, face?: ToothFace) => void;
}) {
  const { theme } = useTheme();
  const statuses = computeFaceStatus(entries);
  const hasEntries = entries.length > 0;
  const [hovered, setHovered] = useState<ToothFace | null>(null);
  const faces = getFaceLayout(number);

  const sorted = [...entries].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
  const isMissing = sorted.find((e) => !e.face)?.status === "ausente";

  // Hover needs to read clearly in BOTH themes: a plain white fill disappears
  // against the light theme's near-white glass, so dark mode gets the "glass
  // catching light" white glow while light mode gets a tinted highlight —
  // and the stroke always thickens/colors on hover regardless of theme, so
  // there's a contrast cue even when the fill alone isn't enough.
  function fillFor(face: ToothFace) {
    if (hovered === face) {
      return theme.mode === "light" ? `${theme.colors.primary}33` : "rgba(255, 255, 255, 0.9)";
    }
    return STATUS_FILL[statuses[face]];
  }

  function strokeFor(face: ToothFace) {
    return hovered === face ? theme.colors.primary : theme.mode === "light" ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.2)";
  }

  function strokeWidthFor(face: ToothFace) {
    return hovered === face ? 2 : 0.75;
  }

  return (
    <div
      style={{
        ...glassSurface(theme, { radius: theme.radius.sm }),
        padding: 4,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
      }}
    >
      <svg width="40" height="40" viewBox="0 0 40 40" style={{ display: "block" }}>
        {faces.map((f) => (
          <polygon
            key={f.key}
            points={f.path}
            fill={fillFor(f.key)}
            stroke={strokeFor(f.key)}
            strokeWidth={strokeWidthFor(f.key)}
            onClick={() => onSelect(number, f.key)}
            onMouseEnter={() => setHovered(f.key)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: "pointer", transition: `fill ${theme.motion.fast}ms, stroke ${theme.motion.fast}ms` }}
          />
        ))}
        <rect
          x={14}
          y={14}
          width={12}
          height={12}
          fill={fillFor("oclusal")}
          stroke={strokeFor("oclusal")}
          strokeWidth={strokeWidthFor("oclusal")}
          onClick={() => onSelect(number, "oclusal")}
          onMouseEnter={() => setHovered("oclusal")}
          onMouseLeave={() => setHovered(null)}
          style={{ cursor: "pointer", transition: `fill ${theme.motion.fast}ms, stroke ${theme.motion.fast}ms` }}
        />
        {isMissing && (
          <g onClick={() => onSelect(number)} style={{ cursor: "pointer" }}>
            <line x1={5} y1={5} x2={35} y2={35} stroke="#E0504F" strokeWidth={4} strokeLinecap="round" />
            <line x1={35} y1={5} x2={5} y2={35} stroke="#E0504F" strokeWidth={4} strokeLinecap="round" />
            <line x1={5} y1={5} x2={35} y2={35} stroke="#FF8A87" strokeWidth={1.25} strokeLinecap="round" />
            <line x1={35} y1={5} x2={5} y2={35} stroke="#FF8A87" strokeWidth={1.25} strokeLinecap="round" />
          </g>
        )}
      </svg>
      <button
        onClick={() => onSelect(number)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontSize: 9,
          color: hasEntries ? theme.colors.textPrimary : theme.colors.textSecondary,
          fontWeight: hasEntries ? theme.typography.weights.semibold : theme.typography.weights.regular,
        }}
      >
        {number}
      </button>
    </div>
  );
}
