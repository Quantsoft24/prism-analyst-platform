"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthUser } from "@/lib/auth/useAuthUser";
import { useMe } from "@/lib/api/me";
import { useDeleteConversation, useRecentConversations, useRenameConversation } from "@/lib/api/conversations";
import { useBacktests, useStrategies } from "@/lib/api/portfolio";
import { useChatActions } from "@/components/ChatProvider";

import styles from "./AccountView.module.css";

/**
 * "My Activity" — the user's home base: identity + everything they own
 * (conversations, saved strategies, backtests), all backend-driven. Read-only
 * hub; editing lives in Settings. Conversations open/replay in the chat view.
 */
export default function AccountView() {
  const auth = useAuthUser();
  const me = useMe();
  const conversations = useRecentConversations();
  const deleteConversation = useDeleteConversation();
  const renameConversation = useRenameConversation();
  const strategies = useStrategies();
  const backtests = useBacktests();
  const router = useRouter();
  const { sendRecent } = useChatActions();

  const [search, setSearch] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  const filteredConversations = conversations.items.filter((c) =>
    c.label.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const saveRename = (id: string) => {
    const title = draft.trim();
    if (title) renameConversation.mutate({ sessionId: id, title });
    setEditingId(null);
  };

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
        {conversations.items.length > 0 && (
          <input
            className={styles.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
          />
        )}
        {conversations.loading && <div className={styles.muted}>Loading…</div>}
        {!conversations.loading && conversations.items.length === 0 && (
          <div className={styles.muted}>No conversations yet — start one in Research Chat.</div>
        )}
        {!conversations.loading && conversations.items.length > 0 && filteredConversations.length === 0 && (
          <div className={styles.muted}>No conversations match “{search}”.</div>
        )}
        <div className={styles.list}>
          {filteredConversations.slice(0, 15).map((c) => (
            <div key={c.id} className={styles.row}>
              {editingId === c.id ? (
                <div className={styles.editRow}>
                  <input
                    className={styles.editInput}
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(c.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <button className={styles.rowAction} onClick={() => saveRename(c.id)}>Save</button>
                  <button className={styles.rowAction} onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              ) : (
                <>
                  <button className={styles.rowMainBtn} onClick={() => sendRecent(c.id)}>
                    <span className={styles.rowMain}>{c.label}</span>
                  </button>
                  {!conversations.isMock && (
                    <>
                      <button
                        className={styles.rowEditBtn}
                        title="Rename"
                        aria-label="Rename conversation"
                        onClick={() => {
                          setEditingId(c.id);
                          setDraft(c.label);
                        }}
                      >
                        ✎
                      </button>
                      <button
                        className={styles.rowDelete}
                        title="Hide this conversation"
                        aria-label="Hide conversation"
                        disabled={deleteConversation.isPending}
                        onClick={() => deleteConversation.mutate(c.id)}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
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
