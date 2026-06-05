"use client";

import Link from "next/link";

import { MOCK_STATS, MOCK_TOOLS, type StatItem, type ToolItem } from "@/lib/mockData";
import { config } from "@/lib/config";
import { useAuthUser } from "@/lib/auth/useAuthUser";
import { useRecentConversations } from "@/lib/api/conversations";
import { useUsage } from "@/lib/api/me";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useChatActions } from "@/components/ChatProvider";
import styles from "./DashboardView.module.css";

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/* ── Hero Section ── */
function HeroCard({ onQuickPrompt }: { onQuickPrompt: (q: string) => void }) {
  const auth = useAuthUser();
  const firstName = (auth.name || "").split(" ")[0];
  // Show the name only for a real signed-in user (or dev mock); not "Guest".
  const greetName = auth.isSignedIn || !auth.authEnabled ? firstName : "";
  const prompts = [
    "Summarise Reliance Q4 filing",
    "Compare HDFC vs ICICI margins",
    "IT services peer set",
    "Build DCF for Tata Motors",
  ];

  const today = new Date();
  const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = today.toLocaleDateString("en-US", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className={styles.hero}>
      <div className={styles.heroEyebrow}>— {dayName} · {dateStr}</div>
      <h1 className={styles.heroTitle}>
        Good morning{greetName ? `, ${greetName}` : ""}.<br />
        <em>Three filings</em> dropped overnight on your watchlist.
      </h1>
      <p className={styles.heroDesc}>
        Earnings season heat-map looks busy this week. I&apos;ve prepared morning briefs and flagged anomalies in Reliance and Infosys filings.
      </p>
      <div className={styles.heroActions}>
        {prompts.map((p) => (
          <button key={p} className={styles.quickPrompt} onClick={() => onQuickPrompt(p)}>
            {p}
          </button>
        ))}
      </div>
      <div className={styles.numberArt}>15</div>
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({ stat }: { stat: StatItem }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>{stat.title}</span>
        <a className={styles.cardLink}>{stat.link}</a>
      </div>
      <div className={styles.statValue}>{stat.value}</div>
      <span className={stat.deltaType === "pos" ? styles.statDeltaPos : styles.statDeltaNeg}>
        {stat.delta}
      </span>
      <div className={styles.statContext}>{stat.context}</div>
    </div>
  );
}

/* ── Stats row (real usage from /me/usage; dev → mock) ── */
function StatsRow() {
  const usage = useUsage();
  const u = usage.data;
  const stats: StatItem[] = config.authEnabled
    ? [
        {
          title: "Conversations",
          value: u ? u.conversations.toLocaleString() : "—",
          delta: u ? `${u.runs_7d} this week` : "",
          deltaType: "pos",
          context: "Your research sessions",
          link: "",
        },
        {
          title: "Tool calls",
          value: u ? u.tool_calls.toLocaleString() : "—",
          delta: u ? `${u.runs.toLocaleString()} runs` : "",
          deltaType: "pos",
          context: "Across all your runs",
          link: "",
        },
        {
          title: "Tokens used",
          value: u ? fmtNum(u.input_tokens + u.output_tokens) : "—",
          delta: u ? (u.cost_usd > 0 ? `$${u.cost_usd.toFixed(2)}` : "free tier") : "",
          deltaType: "pos",
          context: "Input + output",
          link: "",
        },
      ]
    : MOCK_STATS;

  return (
    <div className={styles.grid3}>
      {stats.map((s, i) => (
        <StatCard key={i} stat={s} />
      ))}
    </div>
  );
}

/* ── Tracked companies (real — the user's news watchlist) ── */
function TrackedCompaniesCard({ onQuickPrompt }: { onQuickPrompt: (q: string) => void }) {
  const { watchlist } = useWatchlist();
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>Your tracked companies</span>
        <Link className={styles.cardLink} href="/news">Manage →</Link>
      </div>
      {watchlist.length === 0 && (
        <div className={styles.activityItem}>
          <div className={styles.activityContent}>
            <div className={styles.activityTitle}>No companies tracked yet</div>
            <div className={styles.activityMeta}><span>Track some on the News page</span></div>
          </div>
        </div>
      )}
      {watchlist.slice(0, 6).map((name) => (
        <div
          key={name}
          className={`${styles.activityItem} ${styles.activityClickable}`}
          role="button"
          tabIndex={0}
          onClick={() => onQuickPrompt(`Give me a deep-dive on ${name}`)}
        >
          <div className={styles.tickerLogo}>{name.charAt(0)}</div>
          <div className={styles.activityContent}>
            <div className={styles.activityTitle}>{name}</div>
            <div className={styles.activityMeta}><span>Research →</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Recent conversations (real — the user's chat history) ── */
function RecentActivityCard() {
  const recents = useRecentConversations();
  const { sendRecent } = useChatActions();
  const items = recents.items.slice(0, 5);
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>Recent conversations</span>
        <Link className={styles.cardLink} href="/account">All →</Link>
      </div>
      {recents.loading && <div className={styles.activityItem}>Loading…</div>}
      {!recents.loading && items.length === 0 && (
        <div className={styles.activityItem}>
          <div className={styles.activityContent}>
            <div className={styles.activityTitle}>No conversations yet</div>
            <div className={styles.activityMeta}><span>Start one in Research Chat</span></div>
          </div>
        </div>
      )}
      {items.map((c) => (
        <div
          key={c.id}
          className={`${styles.activityItem} ${styles.activityClickable}`}
          role="button"
          tabIndex={0}
          onClick={() => sendRecent(c.id)}
        >
          <div className={styles.activityDot} style={{ background: "var(--accent)" }} />
          <div className={styles.activityContent}>
            <div className={styles.activityTitle}>{c.label}</div>
            <div className={styles.activityMeta}><span>Open →</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Tool Chip ── */
function ToolChip({ tool, onClick }: { tool: ToolItem; onClick: () => void }) {
  return (
    <div className={styles.toolChip} onClick={onClick}>
      <div className={styles.toolChipNum}>{tool.num}</div>
      <div className={styles.toolChipIcon}>
        <ToolIcon icon={tool.icon} />
      </div>
      <div className={styles.toolChipName}>{tool.name}</div>
      <div className={styles.toolChipDesc}>{tool.desc}</div>
    </div>
  );
}

/* ── Add Tool Chip ── */
function AddToolChip() {
  return (
    <div className={`${styles.toolChip} ${styles.toolChipAdd}`}>
      <div className={styles.toolChipNum}>+ ADD</div>
      <div className={`${styles.toolChipIcon} ${styles.toolChipIconAdd}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>
      <div className={styles.toolChipName}>Add Custom Tool</div>
      <div className={styles.toolChipDesc}>Connect MCP server or API</div>
    </div>
  );
}

/* ── SVG icon mapper ── */
function ToolIcon({ icon }: { icon: string }) {
  const icons: Record<string, React.ReactNode> = {
    report: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
    chart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-5"/></svg>,
    search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
    compose: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>,
    cube: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
    news: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/></svg>,
    shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    filings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    "bar-chart": <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    filter: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
    compare: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="18"/><rect x="14" y="8" width="7" height="13"/></svg>,
    pulse: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    globe: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10"/></svg>,
    book: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  };
  return <>{icons[icon] || icons.report}</>;
}

/* ── Main Dashboard Component ── */
interface DashboardViewProps {
  onQuickPrompt: (query: string) => void;
}

export default function DashboardView({ onQuickPrompt }: DashboardViewProps) {
  return (
    <div className={styles.dashboard}>
      {/* Hero */}
      <HeroCard onQuickPrompt={onQuickPrompt} />

      {/* Stats Row */}
      <StatsRow />

      {/* Tracked companies + Recent conversations */}
      <div className={styles.grid2}>
        <TrackedCompaniesCard onQuickPrompt={onQuickPrompt} />
        <RecentActivityCard />
      </div>

      {/* Tools Grid */}
      <div className={styles.cardHeader} style={{ marginBottom: 14 }}>
        <span className={styles.cardTitle}>Capabilities · 15 tools</span>
        <a className={styles.cardLink}>Configure →</a>
      </div>
      <div className={styles.toolsGrid}>
        {MOCK_TOOLS.map((t) => (
          <ToolChip key={t.num} tool={t} onClick={() => onQuickPrompt(t.prompt)} />
        ))}
        <AddToolChip />
      </div>
    </div>
  );
}
