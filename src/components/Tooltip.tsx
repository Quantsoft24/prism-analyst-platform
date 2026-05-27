"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import styles from "./Tooltip.module.css";

type Side = "right" | "top" | "bottom" | "left";

interface TooltipProps {
  /** The visible label. Use the same string as aria-label on the trigger. */
  label: string;
  /** Optional keyboard shortcut shown in dim mono next to the label
   *  (e.g. "⌘B"). Same pattern Claude / Linear use. */
  shortcut?: string;
  /** Default ``right`` — matches the icon-rail use case in the sidebar. */
  side?: Side;
  /** Hover-out → show delay in ms. Default 300, matches Claude / GPT. */
  delay?: number;
  /** Skip the tooltip entirely (the trigger renders as-is). Use this when
   *  the label is already visible (e.g., sidebar in expanded mode). */
  disabled?: boolean;
  children: React.ReactNode;
}

interface Pos {
  top: number;
  left: number;
}

/**
 * Tooltip — portal-rendered, accessible custom tooltip.
 *
 * Why a custom component instead of native ``title``:
 *   • native tooltips wait ~1s before showing and offer zero styling
 *     control — they feel sluggish in a Claude/GPT-style sidebar.
 *   • the sidebar's parent shell has ``overflow: hidden`` (necessary to
 *     clip labels during the width transition). A CSS-only ``::after``
 *     tooltip would be clipped. Rendering via ``createPortal`` to
 *     ``document.body`` escapes the overflow stacking context cleanly.
 *
 * Accessibility:
 *   • Shown on both ``mouseenter`` AND ``focus`` so keyboard users get it.
 *   • Hidden on Escape (keyboard escape hatch — Claude does the same).
 *   • The trigger should carry ``aria-label`` matching ``label`` — this
 *     component does not set aria-describedby because the visible text
 *     would be redundant and the SR would announce it twice.
 */
export default function Tooltip({
  label,
  shortcut,
  side = "right",
  delay = 300,
  disabled = false,
  children,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [mounted, setMounted] = useState(false);

  const triggerRef = useRef<HTMLSpanElement>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ``createPortal`` requires document — only available client-side.
  useEffect(() => setMounted(true), []);

  // Compute tooltip position from the trigger's bounding rect. Called when
  // we're about to show; recomputed if the user scrolls or resizes mid-show.
  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 10; // distance from trigger edge to tooltip edge
    switch (side) {
      case "right":
        setPos({ top: rect.top + rect.height / 2, left: rect.right + gap });
        break;
      case "left":
        setPos({ top: rect.top + rect.height / 2, left: rect.left - gap });
        break;
      case "top":
        setPos({ top: rect.top - gap, left: rect.left + rect.width / 2 });
        break;
      case "bottom":
        setPos({ top: rect.bottom + gap, left: rect.left + rect.width / 2 });
        break;
    }
  }, [side]);

  const show = useCallback(() => {
    if (disabled) return;
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    showTimerRef.current = setTimeout(() => {
      updatePos();
      setVisible(true);
    }, delay);
  }, [disabled, delay, updatePos]);

  const hide = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    setVisible(false);
  }, []);

  // While the tooltip is visible, reposition on scroll/resize so the chip
  // doesn't drift away from the trigger.
  useEffect(() => {
    if (!visible) return;
    const onUpdate = () => updatePos();
    window.addEventListener("scroll", onUpdate, true);
    window.addEventListener("resize", onUpdate);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onUpdate, true);
      window.removeEventListener("resize", onUpdate);
      document.removeEventListener("keydown", onKey);
    };
  }, [visible, updatePos, hide]);

  // If the trigger disables tooltips after we've shown one (e.g. sidebar
  // expands while the user is hovering), hide it immediately.
  useEffect(() => {
    if (disabled) hide();
  }, [disabled, hide]);

  // Tooltip translate baseline — keep the chip centered along the
  // perpendicular axis to its side. Initial transform (overridden by the
  // CSS animation's keyframe end-state).
  const baseTransform =
    side === "left" || side === "right" ? "translateY(-50%)" : "translateX(-50%)";

  return (
    <>
      <span
        ref={triggerRef}
        className={styles.trigger}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {mounted && visible && pos
        ? createPortal(
            <div
              className={styles.tooltip}
              role="tooltip"
              data-side={side}
              style={{
                top: pos.top,
                left: pos.left,
                transform: baseTransform,
              }}
            >
              {label}
              {shortcut && <span className={styles.kbd}>{shortcut}</span>}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
