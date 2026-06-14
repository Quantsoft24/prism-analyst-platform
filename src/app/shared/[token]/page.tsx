"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

import { conversationsApi, type SharedConversationDetail } from "@/lib/api/conversations";
import type { Citation } from "@/lib/api/chat";
import styles from "./shared.module.css";

type Status = "loading" | "ready" | "unavailable";

/**
 * Public, read-only conversation snapshot at `/shared/{token}`. No auth, no
 * composer, no feedback — a frozen view served by `GET /chat/shared/{token}`.
 * Lives OUTSIDE the (workspace) shell so there's no sidebar / app chrome.
 */
export default function SharedConversationPage() {
  const params = useParams();
  const token = Array.isArray(params.token) ? params.token[0] : (params.token ?? "");
  const [data, setData] = React.useState<SharedConversationDetail | null>(null);
  const [status, setStatus] = React.useState<Status>("loading");

  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setStatus("loading");
    conversationsApi
      .getShared(token)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setStatus("ready");
        }
      })
      .catch(() => {
        // Unknown / revoked / deleted all surface as a single "unavailable".
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>P</span>
          <span className={styles.brandName}>PRISM</span>
        </Link>
        <Link href="/chat" className={styles.cta}>
          Try PRISM →
        </Link>
      </header>

      <main className={styles.main}>
        {status === "loading" && <div className={styles.state}>Loading shared conversation…</div>}

        {status === "unavailable" && (
          <div className={styles.empty}>
            <h1 className={styles.emptyTitle}>This shared link is no longer available</h1>
            <p className={styles.emptyText}>
              It may have been revoked by its owner, or the conversation was deleted.
            </p>
            <Link href="/chat" className={styles.emptyCta}>
              Start your own research →
            </Link>
          </div>
        )}

        {status === "ready" && data && (
          <article className={styles.conversation}>
            <div className={styles.header}>
              <span className={styles.readonlyTag}>Read-only · shared</span>
              <h1 className={styles.title}>{data.title}</h1>
              <p className={styles.meta}>Shared {formatDate(data.shared_at)}</p>
            </div>

            {data.turns.map((t) => (
              <section key={t.agent_run_id} className={styles.turn}>
                <div className={styles.question}>
                  <div className={styles.qrole}>Question</div>
                  <div className={styles.qbody}>{t.user_input}</div>
                </div>
                {t.final_answer ? (
                  <div className={styles.answer}>
                    <div className={styles.arole}>PRISM</div>
                    <div className={styles.aprose}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
                      >
                        {t.final_answer}
                      </ReactMarkdown>
                    </div>
                    {t.structured?.citations?.length ? (
                      <Sources citations={t.structured.citations} />
                    ) : null}
                  </div>
                ) : null}
              </section>
            ))}

            <footer className={styles.footer}>
              Generated with <Link href="/chat" className={styles.footerLink}>PRISM</Link> — an AI
              research analyst for Indian markets.
            </footer>
          </article>
        )}
      </main>
    </div>
  );
}

function Sources({ citations }: { citations: Citation[] }) {
  return (
    <div className={styles.sources}>
      <div className={styles.sourcesTitle}>Sources</div>
      <ol className={styles.sourceList}>
        {citations.map((c, i) => (
          <li key={i} className={styles.sourceItem}>
            <span className={styles.sourceLabel}>{c.label}</span>
            <span className={styles.sourceMeta}>
              <span className={styles.sourceKind}>{c.source_kind}</span>
              {c.as_of ? <span> · {c.as_of}</span> : null}
              {c.url ? (
                <>
                  {" · "}
                  <a href={c.url} target="_blank" rel="noreferrer noopener" className={styles.sourceUrl}>
                    open ↗
                  </a>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
