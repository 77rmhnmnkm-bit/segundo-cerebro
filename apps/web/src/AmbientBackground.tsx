import { useTheme } from "./ThemeProvider";

const POSITIONS = [
  { top: "-10%", left: "-8%", size: 520 },
  { top: "10%", left: "60%", size: 460 },
  { top: "55%", left: "-12%", size: 480 },
  { top: "60%", left: "55%", size: 540 },
];

export function AmbientBackground() {
  const { theme } = useTheme();

  return (
    <div className="sc-mesh-bg">
      {theme.mesh.map((color, i) => {
        const pos = POSITIONS[i % POSITIONS.length];
        return (
          <div
            key={color}
            className="sc-mesh-blob"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.size,
              height: pos.size,
              background: color,
              animationDelay: `${i * -3.5}s`,
              transition: `background ${theme.motion.slow}ms ${theme.motion.easing}`,
            }}
          />
        );
      })}
    </div>
  );
}
