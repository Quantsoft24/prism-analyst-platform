"use client";

import * as React from "react";

import { conversationsApi } from "@/lib/api/conversations";
import { useToast } from "./Toast";
import styles from "./ShareModal.module.css";

/**
 * Share a conversation as a read-only public link. Opening the modal creates (or
 * fetches) the link via `POST …/share` (idempotent), shows it to copy, and lets
 * the owner revoke it. The link is a FROZEN snapshot — messages sent after
 * sharing never appear (enforced server-side via `shared_run_ids`).
 */
export default function ShareModal({
  sessionId,
  label,
  open,
  onClose,
}: {
  sessionId: string;
  label: string;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [revoking, setRevoking] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // Create-or-get the link whenever the modal opens.
  React.useEffect(() => {
    if (!open) return;
    setUrl(null);
    setError(false);
    setCopied(false);
    setLoading(true);
    let cancelled = false;
    conversationsApi
      .share(sessionId)
      .then((sh) => {
        if (!cancelled) setUrl(`${window.location.origin}/shared/${sh.token}`);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sessionId]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast("Link copied", "success");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Couldn't copy the link", "error");
    }
  };

  const revoke = async () => {
    setRevoking(true);
    try {
      await conversationsApi.revokeShare(sessionId);
      toast("Share link revoked", "success");
      onClose();
    } catch {
      toast("Couldn't revoke the link", "error");
    } finally {
      setRevoking(false);
    }
  };

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Share conversation">
        <div className={styles.header}>
          <h2 className={styles.title}>Share “{label}”</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className={styles.caveat}>
          Anyone with the link can view a <strong>read-only</strong> copy of this conversation. It&apos;s
          a snapshot — messages you send afterwards won&apos;t appear, and you can revoke it any time.
        </p>

        {loading && <div className={styles.state}>Creating link…</div>}
        {error && (
          <div className={styles.stateError}>Couldn&apos;t create a link. Please try again.</div>
        )}

        {url && (
          <>
            <div className={styles.linkRow}>
              <input
                className={styles.linkInput}
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button type="button" className={styles.copyBtn} onClick={copy}>
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.revokeBtn}
                onClick={revoke}
                disabled={revoking}
              >
                {revoking ? "Revoking…" : "Revoke link"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
