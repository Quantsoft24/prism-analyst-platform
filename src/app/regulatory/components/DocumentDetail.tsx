"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { useAuthUser } from "@/lib/auth/useAuthUser";
import { formatRegDate, typeMeta, useRegDoc, useToggleBookmark } from "@/lib/api/regulatory";

import { toneClass, sevClass } from "./parts";
import styles from "./regulatory.module.css";

interface Props {
  id: number | null;
  onClose: () => void;
  onAsk?: (query: string) => void;
}

/** Slide-over detail for one regulatory document. */
export default function DocumentDetail({ id, onClose, onAsk }: Props) {
  const { data: doc, isLoading, isError } = useRegDoc(id);
  const auth = useAuthUser();
  const bookmark = useToggleBookmark();

  // Esc to close + lock body scroll while open.
  React.useEffect(() => {
    if (id == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [id, onClose]);

  if (id == null) return null;

  const meta = doc ? typeMeta(doc.type) : null;
  const tags = doc?.ai_tags;

  return (
    <div className={styles.scrim} onClick={onClose}>
      <aside className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.drawerHead}>
          <div className={styles.drawerHeadMain}>
            {meta && (
              <span className={cn(styles.docTag, toneClass(meta.tone))}>{meta.label}</span>
            )}
            <div className={styles.drawerTitle}>
              {isLoading ? "Loading…" : doc ? doc.title : "Document"}
            </div>
            {doc && (
              <div className={styles.drawerMeta}>
                <span>{formatRegDate(doc.date) || "Undated"}</span>
                {tags?.severity && (
                  <>
                    <span className={styles.dotSep} />
                    <span className={cn(styles.sev, sevClass(tags.severity))}>{tags.severity}</span>
                  </>
                )}
                {tags?.intent && (
                  <>
                    <span className={styles.dotSep} />
                    <span>{tags.intent}</span>
                  </>
                )}
                {doc.sebi_department && (
                  <>
                    <span className={styles.dotSep} />
                    <span>{doc.sebi_department}</span>
                  </>
                )}
              </div>
            )}
          </div>
          <button className={styles.drawerClose} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.drawerBody}>
          {isError && (
            <div className={styles.errorBox}>Couldn&apos;t load this document.</div>
          )}

          {doc && (
            <>
              {/* Actions */}
              <div className={cn(styles.drawerSection, styles.drawerActions)}>
                {onAsk && (
                  <button
                    className={styles.btnPrimary}
                    onClick={() =>
                      onAsk(
                        `Explain the significance and compliance impact of this SEBI ${meta?.label ?? "document"}: "${doc.title}".`,
                      )
                    }
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                    Ask PRISM about this
                  </button>
                )}
                {doc.sebi_url && (
                  <a
                    className={styles.btnGhost}
                    href={doc.sebi_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    View on SEBI
                  </a>
                )}
                {auth.isSignedIn && (
                  <button
                    className={cn(styles.btnGhost, bookmark.isBookmarked(doc.id) && styles.btnGhostActive)}
                    onClick={() => bookmark.toggle(doc.id)}
                    disabled={bookmark.pending}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill={bookmark.isBookmarked(doc.id) ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    {bookmark.isBookmarked(doc.id) ? "Bookmarked" : "Bookmark"}
                  </button>
                )}
              </div>

              {/* Summary */}
              {doc.summary && (
                <div className={styles.drawerSection}>
                  <div className={styles.drawerSectionTitle}>AI Summary</div>
                  <div className={styles.drawerSummary}>{doc.summary}</div>
                </div>
              )}

              {/* Impact */}
              {tags && (tags.topics.length > 0 || tags.stakeholders.length > 0 || tags.deadlines.length > 0 || tags.action_required) && (
                <div className={styles.drawerSection}>
                  <div className={styles.drawerSectionTitle}>Impact &amp; Tags</div>
                  {tags.action_required && (
                    <p className={styles.actionFlag}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                      </svg>
                      Action required
                    </p>
                  )}
                  {tags.topics.length > 0 && (
                    <>
                      <div className={styles.metaLabel}>Topics</div>
                      <div className={styles.chips}>
                        {tags.topics.map((t, i) => (
                          <span key={i} className={styles.chip}>{t}</span>
                        ))}
                      </div>
                    </>
                  )}
                  {tags.stakeholders.length > 0 && (
                    <>
                      <div className={styles.metaLabel}>Stakeholders</div>
                      <div className={styles.chips}>
                        {tags.stakeholders.map((t, i) => (
                          <span key={i} className={styles.chip}>{t}</span>
                        ))}
                      </div>
                    </>
                  )}
                  {tags.deadlines.length > 0 && (
                    <>
                      <div className={styles.metaLabel}>Deadlines</div>
                      <div className={styles.chips}>
                        {tags.deadlines.map((t, i) => (
                          <span key={i} className={cn(styles.chip, styles.sevMed)}>{formatRegDate(t) || t}</span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Full text */}
              {doc.extracted_text && (
                <div className={styles.drawerSection}>
                  <div className={styles.drawerSectionTitle}>Full Text</div>
                  <div className={styles.drawerFullText}>{doc.extracted_text}</div>
                </div>
              )}

              {/* Metadata */}
              <div className={styles.drawerSection}>
                <div className={styles.drawerSectionTitle}>Metadata</div>
                <div className={styles.metaGrid}>
                  <MetaItem label="Type" value={meta?.label} />
                  {doc.sub_type && <MetaItem label="Sub-type" value={doc.sub_type} />}
                  {doc.sebi_section && <MetaItem label="Section" value={doc.sebi_section} />}
                  {doc.sebi_info_for && <MetaItem label="Addressed to" value={doc.sebi_info_for} />}
                  {doc.meeting_date && (
                    <MetaItem label="Meeting date" value={formatRegDate(doc.meeting_date)} />
                  )}
                  {doc.language && <MetaItem label="Language" value={doc.language.toUpperCase()} />}
                  {doc.sebi_id && <MetaItem label="SEBI ID" value={doc.sebi_id} />}
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className={styles.metaItem}>
      <div className={styles.metaLabel}>{label}</div>
      <div className={styles.metaValue}>{value}</div>
    </div>
  );
}
