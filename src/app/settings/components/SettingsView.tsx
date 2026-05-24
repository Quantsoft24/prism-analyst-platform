"use client";

import { useState } from "react";
import { MOCK_USER } from "@/lib/mockData";
import { useIntegrations, useToggleIntegration, type IntegrationHealth } from "@/lib/api/integrations";
import styles from "./SettingsView.module.css";

/* ── Settings nav items ── */
const SETTINGS_NAV = [
  "Profile",
  "Tools & Capabilities",
  "Data Sources",
  "Model & Reasoning",
  "Citation Policy",
  "Watchlist",
  "Notifications",
  "API & Webhooks",
  "Compliance",
  "Billing",
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

/* ── Main Settings View ── */
export default function SettingsView() {
  const [activeNav, setActiveNav] = useState("Tools & Capabilities");

  /* Toggle states for citation settings */
  const [requireSource, setRequireSource] = useState(true);
  const [crossCheck, setCrossCheck] = useState(true);
  const [complianceRedact, setComplianceRedact] = useState(true);

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
          {/* Profile Section */}
          {activeNav === "Profile" && (
            <div className={styles.settingsSection}>
              <h3>Profile</h3>
              <p className={styles.sectionDesc}>Your account details and workspace preferences.</p>
              <SettingRow label="Name" desc={MOCK_USER.name}>
                <button className={styles.editBtn}>Edit</button>
              </SettingRow>
              <SettingRow label="Firm" desc={MOCK_USER.firm}>
                <button className={styles.editBtn}>Edit</button>
              </SettingRow>
              <SettingRow label="Email" desc="aarav.kapoor@avendus.com">
                <button className={styles.editBtn}>Edit</button>
              </SettingRow>
              <SettingRow label="Role" desc="Senior Analyst — Equity Research">
                <span className={styles.badge}>Pro</span>
              </SettingRow>
            </div>
          )}

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
          {activeNav === "Model & Reasoning" && (
            <div className={styles.settingsSection}>
              <h3>Model &amp; Reasoning</h3>
              <p className={styles.sectionDesc}>Configure the LLM backbone and reasoning behaviour.</p>
              <SettingRow label="Primary model" desc="Used for all research queries and report generation.">
                <select className={styles.select}>
                  <option>Gemini 2.5 Pro</option>
                  <option>Gemini 2.5 Flash</option>
                  <option>GPT-4o</option>
                  <option>Claude 4 Sonnet</option>
                </select>
              </SettingRow>
              <SettingRow label="Temperature" desc="Lower = more deterministic. Higher = more creative.">
                <select className={styles.select}>
                  <option>0.1 (Precise)</option>
                  <option>0.3 (Balanced)</option>
                  <option>0.7 (Creative)</option>
                </select>
              </SettingRow>
              <SettingRow label="Chain-of-thought reasoning" desc="Show intermediate reasoning steps in tool calls.">
                <Toggle on={true} onToggle={() => {}} />
              </SettingRow>
              <SettingRow label="Multi-step verification" desc="Agent self-checks numeric claims before answering.">
                <Toggle on={true} onToggle={() => {}} />
              </SettingRow>
            </div>
          )}

          {/* Citation Policy */}
          {activeNav === "Citation Policy" && (
            <div className={styles.settingsSection}>
              <h3>Citation Policy</h3>
              <p className={styles.sectionDesc}>
                Strictness of citation and validation across all generated content.
              </p>
              <SettingRow label="Require source on every numeric claim" desc="Refuses to output unsourced figures.">
                <Toggle on={requireSource} onToggle={() => setRequireSource(!requireSource)} />
              </SettingRow>
              <SettingRow label="Cross-check across ≥2 sources" desc="Flags discrepancies as anomalies.">
                <Toggle on={crossCheck} onToggle={() => setCrossCheck(!crossCheck)} />
              </SettingRow>
              <SettingRow label="Compliance redactions" desc="Strip MNPI before producing client-facing output.">
                <Toggle on={complianceRedact} onToggle={() => setComplianceRedact(!complianceRedact)} />
              </SettingRow>
              <SettingRow label="Default region" desc="India (NSE / BSE / SEBI). Switch to expand globally.">
                <select className={styles.select}>
                  <option>India</option>
                  <option>Global</option>
                  <option>US (SEC)</option>
                  <option>Europe</option>
                </select>
              </SettingRow>
            </div>
          )}

          {/* Watchlist */}
          {activeNav === "Watchlist" && (
            <div className={styles.settingsSection}>
              <h3>Watchlist</h3>
              <p className={styles.sectionDesc}>Manage monitored companies and alert thresholds.</p>
              <SettingRow label="Reliance Industries" desc="NSE: RELIANCE · All filing types">
                <Toggle on={true} onToggle={() => {}} />
              </SettingRow>
              <SettingRow label="HDFC Bank" desc="NSE: HDFCBANK · Results + Board meetings">
                <Toggle on={true} onToggle={() => {}} />
              </SettingRow>
              <SettingRow label="Infosys" desc="NSE: INFY · All filing types">
                <Toggle on={true} onToggle={() => {}} />
              </SettingRow>
              <SettingRow label="Tata Motors" desc="NSE: TATAMOTORS · Results only">
                <Toggle on={true} onToggle={() => {}} />
              </SettingRow>
              <SettingRow label="Adani Ports" desc="NSE: ADANIPORTS · All + SEBI alerts">
                <Toggle on={true} onToggle={() => {}} />
              </SettingRow>
            </div>
          )}

          {/* Notifications */}
          {activeNav === "Notifications" && (
            <div className={styles.settingsSection}>
              <h3>Notifications</h3>
              <p className={styles.sectionDesc}>Configure how PRISM alerts you to new filings and events.</p>
              <SettingRow label="Email alerts for new filings" desc="Sends digest when watchlist companies file.">
                <Toggle on={true} onToggle={() => {}} />
              </SettingRow>
              <SettingRow label="Browser push notifications" desc="Real-time alerts in your browser tab.">
                <Toggle on={false} onToggle={() => {}} />
              </SettingRow>
              <SettingRow label="Weekly summary" desc="Automated end-of-week recap email.">
                <Toggle on={true} onToggle={() => {}} />
              </SettingRow>
              <SettingRow label="SEBI compliance alerts" desc="Immediate alert for insider trading, related party.">
                <Toggle on={true} onToggle={() => {}} />
              </SettingRow>
            </div>
          )}

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

          {/* Billing */}
          {activeNav === "Billing" && (
            <div className={styles.settingsSection}>
              <h3>Billing</h3>
              <p className={styles.sectionDesc}>Your subscription and usage details.</p>
              <SettingRow label="Current plan" desc="PRISM Pro — ₹24,999/month">
                <span className={styles.badge}>Active</span>
              </SettingRow>
              <SettingRow label="Usage this month" desc="847 tool calls · 12 reports published">
                <button className={styles.editBtn}>Details</button>
              </SettingRow>
              <SettingRow label="Next billing date" desc="1 June 2026">
                <button className={styles.editBtn}>Manage</button>
              </SettingRow>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
