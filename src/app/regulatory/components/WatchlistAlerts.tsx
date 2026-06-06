"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { useAuthUser } from "@/lib/auth/useAuthUser";
import {
  EMPTY_PERSONALIZATION,
  useRegAlerts,
  useRegBookmarks,
  useRegPersonalization,
  usePutRegPersonalization,
  type AlertRules,
  type RegPersonalization,
  type TermKind,
  type TrackedTerm,
} from "@/lib/api/regulatory";

import { DocRow, EmptyState, SkeletonRows } from "./parts";
import styles from "./regulatory.module.css";

const RULE_META: { key: keyof AlertRules; label: string; desc: string }[] = [
  { key: "orders_naming_entity", label: "Orders naming a tracked entity", desc: "Enforcement & adjudication orders that mention your entities" },
  { key: "circular_matching_topic", label: "Circulars matching a topic", desc: "New circulars / regulations on your tracked themes" },
  { key: "deadline_soon", label: "Deadline within 7 days", desc: "Compliance deadlines approaching for tracked items" },
];

interface Props {
  onOpenDoc: (id: number) => void;
  onGoLibrary: (type?: string) => void;
}

export default function WatchlistAlerts({ onOpenDoc, onGoLibrary }: Props) {
  const auth = useAuthUser();
  const pers = useRegPersonalization();
  const put = usePutRegPersonalization();

  const data: RegPersonalization = pers.data ?? EMPTY_PERSONALIZATION;
  const canEdit = auth.isSignedIn;

  const [term, setTerm] = React.useState("");
  const [kind, setKind] = React.useState<TermKind>("entity");

  const alerts = useRegAlerts(20, canEdit && data.tracked.length > 0);
  const bookmarks = useRegBookmarks(canEdit);

  // Show a loader (not stale alerts) while the tracked terms change and the
  // alert feed re-computes server-side.
  const trackedKey = data.tracked.map((t) => `${t.kind}:${t.term}`).join("|");
  const [alertsLoading, setAlertsLoading] = React.useState(false);
  const prevTracked = React.useRef(trackedKey);
  React.useEffect(() => {
    if (prevTracked.current !== trackedKey) {
      prevTracked.current = trackedKey;
      setAlertsLoading(true);
    }
  }, [trackedKey]);
  React.useEffect(() => {
    if (alertsLoading && !alerts.isFetching) setAlertsLoading(false);
  }, [alertsLoading, alerts.isFetching]);
  const showAlertsSkeleton = alerts.isLoading || alertsLoading;

  const save = (next: RegPersonalization) => put.mutate(next);

  const addTerm = () => {
    const t = term.trim();
    if (!t) return;
    if (data.tracked.some((x) => x.term.toLowerCase() === t.toLowerCase())) {
      setTerm("");
      return;
    }
    save({ ...data, tracked: [...data.tracked, { term: t, kind }] });
    setTerm("");
  };
  const removeTerm = (t: TrackedTerm) =>
    save({ ...data, tracked: data.tracked.filter((x) => x.term !== t.term) });
  const toggleRule = (key: keyof AlertRules) =>
    save({ ...data, alert_rules: { ...data.alert_rules, [key]: !data.alert_rules[key] } });

  const entities = data.tracked.filter((t) => t.kind === "entity");
  const topics = data.tracked.filter((t) => t.kind === "topic");

  if (auth.authEnabled && !auth.isSignedIn) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyTitle}>Sign in to build your watchlist</div>
        <div className={styles.emptyText}>
          Track companies and themes, set alert rules, and bookmark documents —
          all saved to your account and synced across devices.
        </div>
      </div>
    );
  }
  if (!auth.authEnabled) {
    return (
      <div className={styles.notice}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          Watchlist &amp; Alerts persist to your account once authentication is
          enabled. Auth is off in this environment, so changes won&apos;t be saved.
        </span>
      </div>
    );
  }

  return (
    <>
      {/* Stats */}
      <div className={styles.statGrid}>
        <Stat label="Tracked Entities" value={entities.length} />
        <Stat label="Tracked Topics" value={topics.length} />
        <Stat label="Open Alerts" value={alerts.data?.total ?? 0} />
        <Stat label="Bookmarks" value={data.bookmarks.length} />
      </div>

      <div className={styles.grid2}>
        {/* Recent alerts */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>Recent Alerts</span>
            <button className={styles.cardLink} onClick={() => onGoLibrary()}>
              Browse all →
            </button>
          </div>
          {data.tracked.length === 0 ? (
            <EmptyState
              title="No tracked terms yet"
              text="Add a company or topic on the right to start receiving alerts."
            />
          ) : showAlertsSkeleton ? (
            <SkeletonRows n={5} />
          ) : alerts.data && alerts.data.items.length > 0 ? (
            <div className={styles.docList}>
              {alerts.data.items.map((a) => (
                <DocRow key={a.id} doc={a} onOpen={onOpenDoc} />
              ))}
            </div>
          ) : (
            <EmptyState title="No recent matches" text="Nothing new matched your tracked terms." />
          )}
        </section>

        {/* Right column */}
        <div>
          <section className={cn(styles.card, styles.stackCard)}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>Tracked terms</span>
            </div>
            <div className={styles.addTermRow}>
              <div className={styles.kindToggle}>
                <button
                  className={cn(styles.kindBtn, kind === "entity" && styles.kindBtnActive)}
                  onClick={() => setKind("entity")}
                >
                  Entity
                </button>
                <button
                  className={cn(styles.kindBtn, kind === "topic" && styles.kindBtnActive)}
                  onClick={() => setKind("topic")}
                >
                  Topic
                </button>
              </div>
              <input
                className={styles.searchInput}
                placeholder={kind === "entity" ? "Company / entity name…" : "Theme / topic…"}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTerm()}
                disabled={!canEdit}
              />
              <button className={styles.btnPrimary} onClick={addTerm} disabled={!canEdit || !term.trim()}>
                Add
              </button>
            </div>
            {data.tracked.length > 0 ? (
              <div className={styles.chips}>
                {data.tracked.map((t) => (
                  <span key={`${t.kind}-${t.term}`} className={cn(styles.trackedChip, t.kind === "entity" && styles.trackedChipEntity)}>
                    {t.term}
                    <button className={styles.trackedChipRemove} onClick={() => removeTerm(t)} aria-label={`Remove ${t.term}`}>
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className={styles.emptyText}>No tracked entities or topics yet.</div>
            )}
          </section>

          <section className={cn(styles.card, styles.stackCard)}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>Alert rules</span>
            </div>
            {RULE_META.map((r) => (
              <div key={r.key} className={styles.ruleRow}>
                <div className={styles.ruleInfo}>
                  <div className={styles.ruleLabel}>{r.label}</div>
                  <div className={styles.ruleDesc}>{r.desc}</div>
                </div>
                <button
                  className={cn(styles.toggle, data.alert_rules[r.key] && styles.toggleOn)}
                  onClick={() => toggleRule(r.key)}
                  disabled={!canEdit}
                  aria-label={r.label}
                />
              </div>
            ))}
          </section>

          {data.bookmarks.length > 0 && (
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>Bookmarks</span>
              </div>
              {bookmarks.isLoading ? (
                <SkeletonRows n={3} />
              ) : bookmarks.data && bookmarks.data.length > 0 ? (
                <div className={styles.docList}>
                  {bookmarks.data.map((d) => (
                    <DocRow key={d.id} doc={d} onOpen={onOpenDoc} />
                  ))}
                </div>
              ) : (
                <div className={styles.emptyText}>Bookmarked documents will appear here.</div>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value.toLocaleString()}</div>
    </div>
  );
}
