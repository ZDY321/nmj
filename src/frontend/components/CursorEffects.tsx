import { useEffect, useRef, useState } from "react";

type CursorPoint = { x: number; y: number };
type CursorBurst = { id: number; x: number; y: number };

const TRAIL_COUNT = 8;

function supportsFinePointer() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function CursorEffects({ enabled }: { enabled: boolean }) {
  const [finePointer, setFinePointer] = useState(false);
  const [bursts, setBursts] = useState<CursorBurst[]>([]);
  const pointerRef = useRef<CursorPoint>({ x: -100, y: -100 });
  const trailRef = useRef<CursorPoint[]>(
    Array.from({ length: TRAIL_COUNT }, () => ({ x: -100, y: -100 }))
  );
  const dotRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const burstIdRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setFinePointer(false);
      return;
    }

    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePointerSupport = () => setFinePointer(supportsFinePointer());
    updatePointerSupport();
    media.addEventListener?.("change", updatePointerSupport);
    reducedMotion.addEventListener?.("change", updatePointerSupport);
    return () => {
      media.removeEventListener?.("change", updatePointerSupport);
      reducedMotion.removeEventListener?.("change", updatePointerSupport);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !finePointer) return;

    const root = document.documentElement;
    root.classList.add("cursor-effects-enabled");

    const render = () => {
      const pointer = pointerRef.current;
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
      }

      let previous = pointer;
      trailRef.current = trailRef.current.map((point, index) => {
        const easing = 0.36 - index * 0.028;
        const next = {
          x: point.x + (previous.x - point.x) * easing,
          y: point.y + (previous.y - point.y) * easing
        };
        const dot = dotRefs.current[index];
        if (dot) {
          const scale = 1 - index * 0.075;
          dot.style.opacity = `${Math.max(0.16, 0.72 - index * 0.07)}`;
          dot.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${scale})`;
        }
        previous = next;
        return next;
      });
      frameRef.current = window.requestAnimationFrame(render);
    };

    const move = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const leave = () => {
      pointerRef.current = { x: -100, y: -100 };
    };
    const click = (event: MouseEvent) => {
      const id = ++burstIdRef.current;
      setBursts((current) => [...current, { id, x: event.clientX, y: event.clientY }]);
      window.setTimeout(() => {
        setBursts((current) => current.filter((burst) => burst.id !== id));
      }, 720);
    };

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerleave", leave, { passive: true });
    window.addEventListener("click", click, { passive: true });
    frameRef.current = window.requestAnimationFrame(render);

    return () => {
      root.classList.remove("cursor-effects-enabled");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerleave", leave);
      window.removeEventListener("click", click);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [enabled, finePointer]);

  if (!enabled || !finePointer) return null;

  return (
    <div className="cursor-effects-layer" aria-hidden="true">
      {trailRef.current.map((_, index) => (
        <span
          key={index}
          ref={(element) => {
            dotRefs.current[index] = element;
          }}
          className="cursor-effects-trail-dot"
        />
      ))}
      <div ref={cursorRef} className="cursor-effects-pointer">
        <svg viewBox="0 0 28 36" role="presentation">
          <path d="M2.4 1.9 25.8 14.7l-11.1 2.2 6.2 12.7-5.1 2.6-6.3-12.6-6.2 9.2Z" />
        </svg>
      </div>
      {bursts.map((burst) => (
        <span
          key={burst.id}
          className="cursor-effects-burst"
          style={{ left: burst.x, top: burst.y }}
        >
          <span className="cursor-effects-burst-ring" />
          {Array.from({ length: 6 }, (_, index) => (
            <span
              key={index}
              className="cursor-effects-burst-dot"
              style={{ transform: `rotate(${index * 60}deg) translateY(-18px)` }}
            />
          ))}
        </span>
      ))}
    </div>
  );
}
