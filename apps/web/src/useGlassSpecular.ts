import { useRef, type CSSProperties, type MouseEvent } from "react";

/**
 * Tracks pointer position over an element and exposes it as CSS vars
 * (--spec-x/--spec-y, 0-100%) so a radial-gradient highlight can follow the
 * cursor — the dynamic specular response Liquid Glass surfaces have.
 */
export function useGlassSpecular<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  function onMouseMove(e: MouseEvent<T>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--spec-x", `${x}%`);
    el.style.setProperty("--spec-y", `${y}%`);
  }

  function onMouseLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--spec-x", "50%");
    el.style.setProperty("--spec-y", "0%");
  }

  return { ref, onMouseMove, onMouseLeave };
}

// Real glass doesn't glow in the middle — light catches the rim. This paints
// the highlight only onto a ~1.5px border ring (via mask-composite: exclude),
// so moving the cursor makes the *edge* glint brighten near the pointer,
// instead of lighting up the whole card like a flashlight.
export const specularOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: "inherit",
  padding: 1.5,
  background:
    "radial-gradient(circle 240px at var(--spec-x, 50%) var(--spec-y, 0%), rgba(255,255,255,0.95), rgba(255,255,255,0) 65%)",
  WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
  WebkitMaskComposite: "xor",
  maskComposite: "exclude",
  mixBlendMode: "overlay",
  pointerEvents: "none",
  transition: "background 80ms linear",
};
