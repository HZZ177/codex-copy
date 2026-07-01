import { ArrowUp } from "lucide-react";
import {
  useEffect,
  useRef,
  type AnimationEvent,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from "react";

import { prefersReducedMotion } from "@/renderer/utils/motionPreference";

import styles from "./ProductShowcaseOverlay.module.css";

const MASCOT_IMAGE_SRC = "/keydex-mascot-figurine.png";
const STREAM_ITEMS = Array.from({ length: 8 }, (_, index) => index);
const SHARD_ITEMS = Array.from({ length: 12 }, (_, index) => index);

function cssVar(name: string, value: number): CSSProperties {
  return { [name]: value } as CSSProperties;
}

export type ProductShowcaseOverlayPhase = "open" | "exiting";

interface ProductShowcaseOverlayProps {
  phase: ProductShowcaseOverlayPhase;
  onRequestClose: () => void;
  onExited: () => void;
}

export function ProductShowcaseOverlay({
  phase,
  onRequestClose,
  onExited,
}: ProductShowcaseOverlayProps) {
  const returnButtonRef = useRef<HTMLButtonElement>(null);
  const artboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    returnButtonRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onRequestClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onRequestClose]);

  useEffect(() => {
    if (phase !== "exiting" || !prefersReducedMotion()) {
      return;
    }
    const timer = window.setTimeout(onExited, 0);
    return () => window.clearTimeout(timer);
  }, [onExited, phase]);

  const closeOverlay = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onRequestClose();
  };

  const updateParallax = (event: PointerEvent<HTMLDivElement>) => {
    const target = artboardRef.current;
    if (!target || prefersReducedMotion()) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    target.style.setProperty("--parallax-x", clampParallax(x).toFixed(3));
    target.style.setProperty("--parallax-y", clampParallax(y).toFixed(3));
  };

  const resetParallax = () => {
    const target = artboardRef.current;
    if (!target) {
      return;
    }
    target.style.setProperty("--parallax-x", "0");
    target.style.setProperty("--parallax-y", "0");
  };

  const handleAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (event.currentTarget !== event.target || phase !== "exiting") {
      return;
    }
    onExited();
  };

  return (
    <section
      className={styles.overlay}
      data-phase={phase}
      data-testid="product-showcase-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Keydex"
      onAnimationEnd={handleAnimationEnd}
    >
      <div className={styles.motionStage} aria-hidden="true">
        <div className={styles.gridLayer} />
        <div className={styles.topRail} />
        <div className={styles.scanBeam} />
        <div className={styles.paperField} />
        <div className={styles.signalFrame}>
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className={styles.streams}>
          {STREAM_ITEMS.map((item) => (
            <span className={styles.stream} style={cssVar("--stream-index", item)} key={item} />
          ))}
        </div>
      </div>

      <div
        ref={artboardRef}
        className={styles.artboard}
        onPointerLeave={resetParallax}
        onPointerMove={updateParallax}
      >
        <div className={styles.scenePlane} aria-hidden="true">
          <span className={styles.planeLine} data-line="one" />
          <span className={styles.planeLine} data-line="two" />
          <span className={styles.planeLine} data-line="three" />
        </div>
        <div className={styles.colorShards} aria-hidden="true">
          {SHARD_ITEMS.map((item) => (
            <span className={styles.colorShard} style={cssVar("--shard-index", item)} key={item} />
          ))}
        </div>
        <div className={styles.mascotStage}>
          <img className={styles.mascotRender} alt="Keydex 3D 小人偶" draggable={false} src={MASCOT_IMAGE_SRC} />
        </div>
      </div>

      <button ref={returnButtonRef} className={styles.returnButton} type="button" onClick={closeOverlay}>
        <ArrowUp size={16} strokeWidth={2.1} />
        <span>回到应用</span>
      </button>
    </section>
  );
}

function clampParallax(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
