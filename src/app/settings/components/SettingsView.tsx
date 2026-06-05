"use client";

import { useEffect, useState } from "react";
import { MOCK_USER } from "@/lib/mockData";
import { config } from "@/lib/config";
import { useIntegrations, useToggleIntegration, type IntegrationHealth } from "@/lib/api/integrations";
import { useMe, useUpdatePreferences, useUsage } from "@/lib/api/me";
import { useAuthUser } from "@/lib/auth/useAuthUser";
import { useWatchlist } from "@/hooks/useWatchlist";
import AccountView from "@/app/account/components/AccountView";
import styles from "./SettingsView.module.css";

/* ── Settings nav items ── */
const SETTINGS_NAV = [
  "Profile",
  "My Activity",
  "Tools & Capabilities",
  "Notifications",
  "Model & Reasoning",
  "Citation Policy",
  "Watchlist",
  "Billing",
  "Data Sources",
  "API & Webhooks",
  "Compliance",
];

/* ── Toggle component ── */
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div
      className={`${styles.toggle} ${on ? styles.toggleOn : ""}`}
      onClick={onToggle}
      role="switch"
      aria-checked={on}
    />
  );
}

/* ── Integration Row (live registry data + firm-level toggle) ──
 * Reads the backend registry; the toggle PERSISTS a firm-level enable/disable
 * (config/integrations.yml is the catalog; firm_integrations stores overrides).
 * Per-user toggles + add-from-UI come with the auth/user-profile slice. */
function IntegrationRow({ integration, index }: { integration: IntegrationHealth; index: number }) {
  const toggle = useToggleIntegration();
  const loaded = integration.status !== "error";
  const statusClass =
    integration.status === "error" ? styles.statusInactive :
    integration.enabled ? styles.statusActive :
    styles.statusInactive;
  const statusLabel =
    integration.status === "error" ? "Error" :
    integration.enabled ? "Active" : "Off";

  return (
    <div className={styles.toolToggleRow}>
      <div className={styles.toolToggleNum}>{index + 1}</div>
      <div className={styles.toolToggleInfo}>
        <div className={styles.toolToggleName}>
          {integration.name}{" "}
          <span className={styles.badge}>{integration.source}</span>
          {integration.tool_count > 0 ? ` · ${integration.tool_count} tool${integration.tool_count === 1 ? "" : "s"}` : ""}
        </div>
        <div className={styles.toolToggleDesc}>
          {integration.status === "error" && integration.error
            ? `Failed to load: ${integration.error}`
            : integration.description}
        </div>
      </div>
      <div className={`${styles.toolToggleStatus} ${statusClass}`}>{statusLabel}</div>
      <Toggle
        on={integration.enabled}
        onToggle={() => {
          // Only toggle integrations that actually loaded; disabled rows can't flip.
          if (loaded && !toggle.isPending) {
            toggle.mutate({ name: integration.name, enabled: !integration.enabled });
          }
        }}
      />
    </div>
  );
}

/* ── Setting Row ── */
function SettingRow({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingInfo}>
        <div className={styles.settingLabel}>{label}</div>
        <div className={styles.settingDesc}>{desc}</div>
      </div>
      {children}
    </div>
  );
}

/* ── Profile (live — Supabase identity + /me) ── */
function ProfileSection() {
  const auth = useAuthUser();
  const me = useMe();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Dev mode (auth off) → the old mock profile, unchanged.
  if (!auth.authEnabled) {
    return (
      <div className={styles.settingsSection}>
        <h3>Profile</h3>
        <p className={styles.sectionDesc}>Your account details and workspace preferences.</p>
        <SettingRow label="Name" desc={MOCK_USER.name}><span className={styles.badge}>Dev</span></SettingRow>
        <SettingRow label="Firm" desc={MOCK_USER.firm}><span className={styles.badge}>Dev</span></SettingRow>
        <p className={styles.sectionDesc}>Sign-in is disabled in this environment.</p>
      </div>
    );
  }

  if (!auth.isSignedIn) {
    return (
      <div className={styles.settingsSection}>
        <h3>Profile</h3>
        <p className={styles.sectionDesc}>
          You&apos;re browsing as a guest. <a className={styles.link} href="/sign-in">Sign in</a> to
          manage your profile and preferences.
        </p>
      </div>
    );
  }

  const startEdit = () => {
    setDraft(auth.name === "Account" ? "" : auth.name);
    setErr(null);
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await auth.updateName(draft.trim());
      await me.refetch();
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't update name.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.settingsSection}>
      <h3>Profile</h3>
      <p className={styles.sectionDesc}>Your account details and workspace.</p>

      <SettingRow label="Name" desc={editing ? "" : auth.name}>
        {editing ? (
          <div className={styles.inlineEdit}>
            <input
              className={styles.select}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Your name"
              autoFocus
            />
            <button className={styles.editBtn} onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className={styles.editBtn} onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        ) : (
          <button className={styles.editBtn} onClick={startEdit}>Edit</button>
        )}
      </SettingRow>
      {err && <p className={styles.errorText}>{err}</p>}

      <SettingRow label="Email" desc={auth.email ?? "—"}>
        <span className={styles.badge}>Verified</span>
      </SettingRow>
      <SettingRow label="Workspace" desc={me.data?.firm_id ?? "Loading…"}>
        <span className={styles.badge}>Personal</span>
      </SettingRow>
      <SettingRow label="Role" desc={me.data?.role ?? "owner"}>
        <span className={styles.badge}>Pilot</span>
      </SettingRow>
      <SettingRow label="Sign out" desc="End your session on this device.">
        <button className={styles.editBtn} onClick={() => void auth.signOut()}>Sign out</button>
      </SettingRow>
    </div>
  );
}

/* ── Notifications (live — persisted to /me preferences) ── */
const NOTIF_DEFAULTS: Record<string, boolean> = { email: true, push: false, weekly: true, sebi: true };
const NOTIF_ROWS: { key: string; label: string; desc: string }[] = [
  { key: "email", label: "Email alerts for new filings", desc: "Sends a digest when watchlist companies file." },
  { key: "push", label: "Browser push notifications", desc: "Real-time alerts in your browser tab." },
  { key: "weekly", label: "Weekly summary", desc: "Automated end-of-week recap email." },
  { key: "sebi", label: "SEBI compliance alerts", desc: "Immediate alert for insider trading, related party." },
];

function NotificationsSection() {
  const me = useMe();
  const update = useUpdatePreferences();
  const [local, setLocal] = useState<Record<string, boolean>>(NOTIF_DEFAULTS);

  // Seed from the saved preferences once /me loads.
  useEffect(() => {
    const saved = (me.data?.preferences?.notifications as Record<string, boolean> | undefined) ?? {};
    setLocal({ ...NOTIF_DEFAULTS, ...saved });
  }, [me.data]);

  const flip = (key: string) => {
    const next = { ...local, [key]: !local[key] };
    setLocal(next); // optimistic
    if (config.authEnabled) update.mutate({ notifications: next });
  };

  return (
    <div className={styles.settingsSection}>
      <h3>Notifications</h3>
      <p className={styles.sectionDesc}>
        How PRISM alerts you to new filings and events.
        {!config.authEnabled && " (Sign in to save these.)"}
      </p>
      {NOTIF_ROWS.map((row) => (
        <SettingRow key={row.key} label={row.label} desc={row.desc}>
          <Toggle on={!!local[row.key]} onToggle={() => flip(row.key)} />
        </SettingRow>
      ))}
    </div>
  );
}

/* ── Persisted preference groups (saved to /me preferences) ── */
const MODEL_DEFAULTS = { primary: "Gemini 2.5 Pro", temperature: "0.3 (Balanced)", cot: true, verify: true };
const CITATION_DEFAULTS = { requireSource: true, crossCheck: true, complianceRedact: true, region: "India" };

function usePersistedGroup<T extends Record<string, unknown>>(groupKey: string, defaults: T) {
  const me = useMe();
  const update = useUpdatePreferences();
  const [local, setLocal] = useState<T>(defaults);
  useEffect(() => {
    const saved = (me.data?.preferences?.[groupKey] as Partial<T> | undefined) ?? {};
    setLocal({ ...defaults, ...saved });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.data]);
  const set = (key: keyof T, value: T[keyof T]) => {
    const next = { ...local, [key]: value };
    setLocal(next); // optimistic
    if (config.authEnabled) update.mutate({ [groupKey]: next });
  };
  return { local, set };
}

function ModelSection() {
  const { local, set } = usePersistedGroup("model", MODEL_DEFAULTS);
  return (
    <div className={styles.settingsSection}>
      <h3>Model &amp; Reasoning</h3>
      <p className={styles.sectionDesc}>
        Configure the LLM backbone and reasoning behaviour.
        {!config.authEnabled && " (Sign in to save these.)"}
      </p>
      <SettingRow label="Primary model" desc="Used for all research queries and report generation.">
        <select className={styles.select} value={local.primary} onChange={(e) => set("primary", e.target.value)}>
          <option>Gemini 2.5 Pro</option>
          <option>Gemini 2.5 Flash</option>
          <option>GPT-4o</option>
          <option>Claude 4 Sonnet</option>
        </select>
      </SettingRow>
      <SettingRow label="Temperature" desc="Lower = more deterministic. Higher = more creative.">
        <select className={styles.select} value={local.temperature} onChange={(e) => set("temperature", e.target.value)}>
          <option>0.1 (Precise)</option>
          <option>0.3 (Balanced)</option>
          <option>0.7 (Creative)</option>
        </select>
      </SettingRow>
      <SettingRow label="Chain-of-thought reasoning" desc="Show intermediate reasoning steps in tool calls.">
        <Toggle on={local.cot} onToggle={() => set("cot", !local.cot)} />
      </SettingRow>
      <SettingRow label="Multi-step verification" desc="Agent self-checks numeric claims before answering.">
        <Toggle on={local.verify} onToggle={() => set("verify", !local.verify)} />
      </SettingRow>
    </div>
  );
}

function CitationSection() {
  const { local, set } = usePersistedGroup("citation", CITATION_DEFAULTS);
  return (
    <div className={styles.settingsSection}>
      <h3>Citation Policy</h3>
      <p className={styles.sectionDesc}>
        Strictness of citation and validation across all generated content.
        {!config.authEnabled && " (Sign in to save these.)"}
      </p>
      <SettingRow label="Require source on every numeric claim" desc="Refuses to output unsourced figures.">
        <Toggle on={local.requireSource} onToggle={() => set("requireSource", !local.requireSource)} />
      </SettingRow>
      <SettingRow label="Cross-check across ≥2 sources" desc="Flags discrepancies as anomalies.">
        <Toggle on={local.crossCheck} onToggle={() => set("crossCheck", !local.crossCheck)} />
      </SettingRow>
      <SettingRow label="Compliance redactions" desc="Strip MNPI before producing client-facing output.">
        <Toggle on={local.complianceRedact} onToggle={() => set("complianceRedact", !local.complianceRedact)} />
      </SettingRow>
      <SettingRow label="Default region" desc="India (NSE / BSE / SEBI). Switch to expand globally.">
        <select className={styles.select} value={local.region} onChange={(e) => set("region", e.target.value)}>
          <option>India</option>
          <option>Global</option>
          <option>US (SEC)</option>
          <option>Europe</option>
        </select>
      </SettingRow>
    </div>
  );
}

function WatchlistSection() {
  const { watchlist, remove } = useWatchlist();
  return (
    <div className={styles.settingsSection}>
      <h3>Watchlist</h3>
      <p className={styles.sectionDesc}>
        Companies you track on the News page — sentiment + filing alerts. Add new ones there.
      </p>
      {watchlist.length === 0 && (
        <p className={styles.sectionDesc}>No companies tracked yet. Add some on the News &amp; Sentiment page.</p>
      )}
      {watchlist.map((name) => (
        <SettingRow key={name} label={name} desc="Tracked company">
          <button className={styles.editBtn} onClick={() => remove(name)}>Remove</button>
        </SettingRow>
      ))}
    </div>
  );
}

function BillingSection() {
  const usage = useUsage();
  const u = usage.data;
  const val = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString());
  return (
    <div className={styles.settingsSection}>
      <h3>Billing &amp; Usage</h3>
      <p className={styles.sectionDesc}>Your plan and usage to date.</p>
      <SettingRow label="Current plan" desc="Pilot — free during the pilot program">
        <span className={styles.badge}>Active</span>
      </SettingRow>
      <SettingRow label="Conversations" desc="Total research sessions">
        <span className={styles.badge}>{val(u?.conversations)}</span>
      </SettingRow>
      <SettingRow label="Tool calls" desc="Across all your runs">
        <span className={styles.badge}>{val(u?.tool_calls)}</span>
      </SettingRow>
      <SettingRow label="Tokens used" desc="Input + output">
        <span className={styles.badge}>{u ? (u.input_tokens + u.output_tokens).toLocaleString() : "—"}</span>
      </SettingRow>
      <SettingRow label="Cost to date" desc="Estimated from model usage">
        <span className={styles.badge}>{u ? (u.cost_usd > 0 ? `$${u.cost_usd.toFixed(2)}` : "Free tier") : "—"}</span>
      </SettingRow>
    </div>
  );
}

/* ── Main Settings View ── */
export default function SettingsView() {
  const [activeNav, setActiveNav] = useState("Profile");

  /* Live integrations from the backend registry */
  const { data: integrations, isLoading: integrationsLoading, isError: integrationsError } = useIntegrations();

  return (
    <div className={styles.settingsView}>
      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.heroEyebrow}>— Workspace Settings</div>
        <h1 className={styles.heroTitle}>Configure PRISM</h1>
        <p className={styles.heroDesc}>
          Tools, data sources, model preferences, and citation policy.
        </p>
      </div>

      <div className={styles.settingsLayout}>
        {/* Left Nav */}
        <div className={styles.settingsNav}>
          {SETTINGS_NAV.map((item) => (
            <button
              key={item}
              className={activeNav === item ? styles.settingsNavItemActive : styles.settingsNavItem}
              onClick={() => setActiveNav(item)}
            >
              {item}
            </button>
          ))}
        </div>

        {/* Content */}
        <div>
          {/* Profile Section — live (Supabase identity + /me) */}
          {activeNav === "Profile" && <ProfileSection />}

          {/* My Activity — the account hub embedded as a settings tab */}
          {activeNav === "My Activity" && <AccountView />}

          {/* Tools Section — live integration registry */}
          {activeNav === "Tools & Capabilities" && (
            <div className={styles.settingsSection}>
              <h3>Tools &amp; Capabilities</h3>
              <p className={styles.sectionDesc}>
                Registered agent integrations. The LLM dynamically picks tools based on your query.
                New tools are added via the integration registry (see docs/INTEGRATION_INTAKE.md).
              </p>
              {integrationsLoading && <p className={styles.sectionDesc}>Loading integrations…</p>}
              {integrationsError && (
                <p className={styles.sectionDesc}>Couldn&apos;t reach the backend integrations endpoint.</p>
              )}
              {integrations && integrations.integrations.length === 0 && (
                <p className={styles.sectionDesc}>No integrations registered yet.</p>
              )}
              {integrations?.integrations.map((integration, i) => (
                <IntegrationRow key={integration.name} integration={integration} index={i} />
              ))}
            </div>
          )}

          {/* Data Sources */}
          {activeNav === "Data Sources" && (
            <div className={styles.settingsSection}>
              <h3>Data Sources</h3>
              <p className={styles.sectionDesc}>Configure which exchanges and feeds PRISM monitors.</p>
              <SettingRow label="NSE (National Stock Exchange)" desc="Real-time filings, corporate actions, results">
                <Toggle on={true} onToggle={() => {}} />
              </SettingRow>
              <SettingRow label="BSE (Bombay Stock Exchange)" desc="Supplementary filings and board meetings">
                <Toggle on={true} onToggle={() => {}} />
              </SettingRow>
              <SettingRow label="SEBI Regulatory Feeds" desc="Compliance alerts, insider trading disclosures">
                <Toggle on={true} onToggle={() => {}} />
              </SettingRow>
              <SettingRow label="Bloomberg Terminal" desc="Consensus estimates, target prices">
                <span className={styles.badge}>Coming soon</span>
              </SettingRow>
              <SettingRow label="Reuters Eikon" desc="Cross-border peer data and sector benchmarks">
                <span className={styles.badge}>Coming soon</span>
              </SettingRow>
            </div>
          )}

          {/* Model & Reasoning */}
          {activeNav === "Model & Reasoning" && <ModelSection />}

          {/* Citation Policy — persisted */}
          {activeNav === "Citation Policy" && <CitationSection />}

          {/* Watchlist — real (your tracked companies) */}
          {activeNav === "Watchlist" && <WatchlistSection />}

          {/* Notifications — live (persisted to /me preferences) */}
          {activeNav === "Notifications" && <NotificationsSection />}

          {/* API & Webhooks */}
          {activeNav === "API & Webhooks" && (
            <div className={styles.settingsSection}>
              <h3>API &amp; Webhooks</h3>
              <p className={styles.sectionDesc}>Programmatic access to PRISM research capabilities.</p>
              <SettingRow label="API Key" desc="pk_live_••••••••••••3f2a">
                <button className={styles.editBtn}>Regenerate</button>
              </SettingRow>
              <SettingRow label="Webhook URL" desc="POST endpoint for real-time events.">
                <button className={styles.editBtn}>Configure</button>
              </SettingRow>
              <SettingRow label="Rate limit" desc="Current plan: 1,000 calls / day">
                <span className={styles.badge}>Pro</span>
              </SettingRow>
            </div>
          )}

          {/* Compliance */}
          {activeNav === "Compliance" && (
            <div className={styles.settingsSection}>
              <h3>Compliance</h3>
              <p className={styles.sectionDesc}>Audit trail and regulatory compliance settings.</p>
              <SettingRow label="Audit log retention" desc="Keep full conversation and tool-call logs.">
                <select className={styles.select}>
                  <option>90 days</option>
                  <option>1 year</option>
                  <option>3 years</option>
                  <option>Indefinite</option>
                </select>
              </SettingRow>
              <SettingRow label="MNPI quarantine" desc="Auto-flag and quarantine material non-public information.">
                <Toggle on={true} onToggle={() => {}} />
              </SettingRow>
              <SettingRow label="Export compliance report" desc="Generate PDF report for compliance team.">
                <button className={styles.editBtn}>Export</button>
              </SettingRow>
            </div>
          )}

          {/* Billing — real usage */}
          {activeNav === "Billing" && <BillingSection />}
        </div>
      </div>
    </div>
  );
}
