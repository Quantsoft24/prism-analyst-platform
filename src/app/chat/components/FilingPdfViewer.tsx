"use client";

import * as React from "react";

import { fetchFilingPdfObjectUrl } from "@/lib/api/stocks";

import styles from "./FilingPdfViewer.module.css";

/** What a citation deep-link opens: a filing PDF at an exact page. */
export interface FilingPdfSource {
  url: string;
  page: number | null;
  label: string;
}

/**
 * Renders a filing PDF at the cited page inside the Research-workspace drawer —
 * the citation→exact-page deep link (a PRISM differentiator). We fetch the PDF
 * through PRISM's auth-gated proxy as a blob object URL (an iframe can't send
 * the auth header, and BSE/NSE block direct embedding), then embed it with
 * `#page=N`. Always offers an "open original" escape hatch.
 */
export default function FilingPdfViewer({
  source,
  onClose,
}: {
  source: FilingPdfSource;
  onClose: () => void;
}) {
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setObjectUrl(null);
    fetchFilingPdfObjectUrl(source.url, ctrl.signal)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        created = u;
        setObjectUrl(u);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Could not load the PDF.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
      if (created) URL.revokeObjectURL(created);
    };
  }, [source.url]);

  const src = objectUrl
    ? `${objectUrl}#page=${source.page ?? 1}&view=FitH`
    : undefined;

  return (
    <div className={styles.viewer}>
      <div className={styles.bar}>
        <button className={styles.back} onClick={onClose} type="button">
          ← Report
        </button>
        <span className={styles.label} title={source.label}>
          {source.label}
          {source.page ? ` · p.${source.page}` : ""}
        </span>
        <a
          className={styles.ext}
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
        >
          Original ↗
        </a>
      </div>
      <div className={styles.stage}>
        {loading && <div className={styles.state}>Loading filing PDF…</div>}
        {error && (
          <div className={styles.state}>
            <div className={styles.errTitle}>Couldn’t open the PDF in-app.</div>
            <div className={styles.errMsg}>{error}</div>
            <a
              className={styles.errLink}
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              Open the filing in a new tab ↗
            </a>
          </div>
        )}
        {src && (
          <iframe className={styles.frame} src={src} title={source.label} />
        )}
      </div>
    </div>
  );
}
