"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthUser } from "@/lib/auth/useAuthUser";
import { useMe } from "@/lib/api/me";
import { useRecentConversations } from "@/lib/api/conversations";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";
import { useBacktests, useStrategies } from "@/lib/api/portfolio";
import { useChatActions } from "@/components/ChatProvider";
import ConversationActionsMenu from "@/components/ConversationActionsMenu";

import styles from "./AccountView.module.css";

/**
 * "My Activity" — the user's home base: identity + everything they own
 * (conversations, saved strategies, backtests), all backend-driven. Read-only
 * hub; editing lives in Settings. Conversations open/replay in the chat view.
 */
export default function AccountView() {
  const auth = useAuthUser();
  const me = useMe();
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [archived, setArchived] = React.useState(false);
  const [limit, setLimit] = React.useState(20);
  const conversations = useRecentConversations(debouncedSearch, { archived, limit });
  const strategies = useStrategies();
  const backtests = useBacktests();
  const router = useRouter();
  const { sendRecent } = useChatActions();

  // Guest (auth on, not signed in) → invite to sign in.
  if (auth.authEnabled && !auth.isSignedIn) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <h1 className={styles.title}>My Activity</h1>
          <p className={styles.emptyText}>
            <Link className={styles.link} href="/sign-in">Sign in</Link> to see your
            conversations, saved strategies, and backtests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ── Identity ── */}
      <header className={styles.header}>
        <div className={styles.avatar}>{auth.initials}</div>
        <div className={styles.idInfo}>
          <div className={styles.name}>{auth.name}</div>
          {auth.email && <div className={styles.sub}>{auth.email}</div>}
          <div className={styles.metaRow}>
            <span className={styles.chip}>Workspace · {me.data?.firm_id ?? "—"}</span>
            <span className={styles.chip}>Role · {me.data?.role ?? "owner"}</span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.btn} href="/settings">Edit profile</Link>
          {auth.isSignedIn && (
            <button className={styles.btn} onClick={() => void auth.signOut()}>Sign out</button>
          )}
        </div>
      </header>

      {/* ── Recent conversations ── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Conversations</h2>
          <Link className={styles.seeAll} href="/chat">Open chat →</Link>
        </div>
        <div className={styles.convControls}>
          <input
            className={styles.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
          />
          <div className={styles.convTabs}>
            <button
              className={cn(styles.convTab, !archived && styles.convTabActive)}
              onClick={() => setArchived(false)}
            >
              All
            </button>
            <button
              className={cn(styles.convTab, archived && styles.convTabActive)}
              onClick={() => setArchived(true)}
            >
              Archived
            </button>
          </div>
        </div>
        {conversations.loading && <div className={styles.muted}>Loading…</div>}
        {!conversations.loading && conversations.items.length === 0 && (
          <div className={styles.muted}>
            {debouncedSearch.trim()
              ? `No conversations match “${search}”.`
              : archived
                ? "No archived conversations."
                : "No conversations yet — start one in Research Chat."}
          </div>
        )}
        <div className={styles.list}>
          {conversations.items.map((c) => (
            <div key={c.id} className={styles.row}>
              <button className={styles.rowMainBtn} onClick={() => sendRecent(c.id)}>
                <span className={styles.rowMain}>{c.label}</span>
              </button>
              {!conversations.isMock && (
                <ConversationActionsMenu
                  id={c.id}
                  label={c.label}
                  pinned={c.pinned}
                  archived={archived}
                  buttonClassName={styles.rowMenuBtn}
                />
              )}
            </div>
          ))}
        </div>
        {!conversations.loading && conversations.items.length >= limit && (
          <button className={styles.loadMore} onClick={() => setLimit((l) => l + 20)}>
            Load more
          </button>
        )}
      </section>

      {/* ── Saved strategies ── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Saved strategies</h2>
          <Link className={styles.seeAll} href="/portfolio">Portfolio Builder →</Link>
        </div>
        {strategies.isLoading && <div className={styles.muted}>Loading…</div>}
        {!strategies.isLoading && (strategies.data?.length ?? 0) === 0 && (
          <div className={styles.muted}>No saved strategies yet.</div>
        )}
        <div className={styles.list}>
          {(strategies.data ?? []).slice(0, 6).map((s) => (
            <button key={s.id} className={styles.row} onClick={() => router.push("/portfolio")}>
              <span className={styles.rowMain}>{s.name}</span>
              <span className={styles.rowMeta}>{new Date(s.updated_at).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Backtests ── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Backtests</h2>
          <Link className={styles.seeAll} href="/portfolio">Portfolio Builder →</Link>
        </div>
        {backtests.isLoading && <div className={styles.muted}>Loading…</div>}
        {!backtests.isLoading && (backtests.data?.length ?? 0) === 0 && (
          <div className={styles.muted}>No backtests yet.</div>
        )}
        <div className={styles.list}>
          {(backtests.data ?? []).slice(0, 6).map((b) => (
            <button key={b.id} className={styles.row} onClick={() => router.push("/portfolio")}>
              <span className={styles.rowMain}>{b.name || "Untitled backtest"}</span>
              <span className={styles.rowMeta}>{b.status}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
