"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import styles from "./Dialog.module.css";

/* ── Public API ─────────────────────────────────────────────────────────────
 * Promise-based dialogs that replace window.alert/confirm/prompt with themed,
 * accessible modals. Usage:
 *   const dialog = useDialog();
 *   if (await dialog.confirm({ title: "Delete?", danger: true })) { … }
 *   const name = await dialog.prompt({ title: "Save as", label: "Name" });
 */

interface ConfirmOpts {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface PromptOpts extends ConfirmOpts {
  label?: string;
  placeholder?: string;
  defaultValue?: string;
}
interface AlertOpts {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
}

interface DialogApi {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  prompt: (opts: PromptOpts) => Promise<string | null>;
  alert: (opts: AlertOpts) => Promise<void>;
}

const DialogContext = React.createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within <DialogProvider>");
  return ctx;
}

type Kind = "confirm" | "prompt" | "alert";

interface DialogState {
  kind: Kind;
  opts: PromptOpts & AlertOpts;
  resolve: (v: unknown) => void;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<DialogState | null>(null);
  const [text, setText] = React.useState("");

  const api = React.useMemo<DialogApi>(() => {
    const open = (kind: Kind, opts: PromptOpts & AlertOpts) =>
      new Promise<unknown>((resolve) => {
        setText((opts as PromptOpts).defaultValue ?? "");
        setState({ kind, opts, resolve });
      });
    return {
      confirm: (o) => open("confirm", o as PromptOpts & AlertOpts).then((v) => Boolean(v)),
      prompt: (o) => open("prompt", o as PromptOpts & AlertOpts).then((v) => (v as string | null)),
      alert: (o) => open("alert", o as PromptOpts & AlertOpts).then(() => undefined),
    };
  }, []);

  const close = (value: unknown) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <DialogContext.Provider value={api}>
      {children}
      {state && (
        <ModalShell onCancel={() => close(state.kind === "confirm" ? false : null)}>
          <h2 className={styles.title}>{state.opts.title}</h2>
          {state.opts.message && <div className={styles.message}>{state.opts.message}</div>}
          {state.kind === "prompt" && (
            <label className={styles.field}>
              {state.opts.label && <span className={styles.label}>{state.opts.label}</span>}
              <input
                className={styles.input}
                autoFocus
                value={text}
                placeholder={state.opts.placeholder}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && text.trim()) close(text.trim());
                }}
              />
            </label>
          )}
          <div className={styles.actions}>
            {state.kind !== "alert" && (
              <button className={styles.cancel} onClick={() => close(state.kind === "confirm" ? false : null)}>
                {state.opts.cancelLabel ?? "Cancel"}
              </button>
            )}
            <button
              className={cn(styles.confirm, state.opts.danger && styles.danger)}
              disabled={state.kind === "prompt" && !text.trim()}
              onClick={() =>
                close(
                  state.kind === "prompt" ? text.trim() : state.kind === "confirm" ? true : undefined,
                )
              }
            >
              {state.opts.confirmLabel ?? (state.kind === "confirm" ? "Confirm" : "OK")}
            </button>
          </div>
        </ModalShell>
      )}
    </DialogContext.Provider>
  );
}

/* ── Reusable modal shell (also exported for bespoke modals) ─────────────── */
export function ModalShell({
  children,
  onCancel,
  width,
}: {
  children: React.ReactNode;
  onCancel: () => void;
  width?: number;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className={styles.scrim} onMouseDown={onCancel}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        style={width ? { maxWidth: width } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
