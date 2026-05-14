"use client";

import { useEffect, useCallback } from "react";

type ShortcutMap = Record<string, () => void>;

/**
 * useKeyboard — Global keyboard shortcut handler
 *
 * Registers Ctrl/Cmd + key combinations.
 */
export function useKeyboard(shortcuts: ShortcutMap) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === "k") {
        e.preventDefault();
        shortcuts["mod+k"]?.();
      }
      if (mod && e.key === "n") {
        e.preventDefault();
        shortcuts["mod+n"]?.();
      }
      if (e.key === "Escape") {
        shortcuts["escape"]?.();
      }
      if (mod && e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        shortcuts[`mod+${e.key}`]?.();
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
