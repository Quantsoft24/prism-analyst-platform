"use client";

import dynamic from "next/dynamic";
import * as React from "react";

import type { BMC, BMCBlock } from "@/lib/api/bmc";
import styles from "./BMC3DExplorer.module.css";

// react-force-graph-3d uses three.js / WebGL → client-only. Dynamic import
// with ssr:false keeps it out of the server bundle (Next.js can't SSR WebGL).
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
  loading: () => <div className={styles.loading}>Loading 3D canvas…</div>,
});

interface BMC3DExplorerProps {
  bmc: BMC;
  /** Click a block node → open its evidence panel (shared with the 2D view). */
  onSelectBlock: (block: BMCBlock) => void;
}

// Fixed hex palette (WebGL canvas can't read CSS vars). Matches PRISM's tokens.
const ACCENT = "#8B6F3F";
const POS = "#2F6B47";
const WARN = "#B07D1F";
const MUTE = "#A8AFB9";

function blockColor(b: BMCBlock): string {
  if (b.status !== "ok") return MUTE;
  if (b.confidence >= 0.75) return POS;
  if (b.confidence >= 0.4) return WARN;
  return MUTE;
}

/**
 * Interactive 3D force-graph view of a canvas: a central company node with the
 * 9 blocks radiating out. More interactive than the old PRISM_ANALYST version:
 * - node size scales with confidence
 * - color encodes confidence/status
 * - directional particles flow company → blocks
 * - hover shows the block's first bullet; click opens the evidence panel
 *
 * Secondary view — the 2D canvas stays the primary, analyst-facing surface.
 */
export default function BMC3DExplorer({ bmc, onSelectBlock }: BMC3DExplorerProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ w: 800, h: 560 });

  // Track container size so the canvas fills it responsively.
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graphData = React.useMemo(() => {
    const nodes: Record<string, unknown>[] = [
      { id: "__company__", name: bmc.ticker, kind: "company", val: 14, color: ACCENT },
    ];
    const links: Record<string, unknown>[] = [];
    for (const b of bmc.blocks) {
      nodes.push({
        id: b.block_id,
        name: b.title,
        kind: "block",
        // Size scales with confidence (min floor so empty blocks are still visible).
        val: 4 + (b.status === "ok" ? b.confidence * 8 : 0),
        color: blockColor(b),
        firstBullet: b.summary_bullets[0] ?? "No filing evidence.",
        confidence: b.confidence,
        status: b.status,
      });
      links.push({ source: "__company__", target: b.block_id });
    }
    return { nodes, links };
  }, [bmc]);

  const blockById = React.useMemo(
    () => Object.fromEntries(bmc.blocks.map((b) => [b.block_id, b])),
    [bmc],
  );

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.hint}>Drag to rotate · scroll to zoom · click a node</div>

      <ForceGraph3D
        width={size.w}
        height={size.h}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        nodeColor={(n: any) => n.color}
        nodeVal={(n: any) => n.val}
        nodeOpacity={0.95}
        nodeResolution={16}
        nodeLabel={(n: any) =>
          n.kind === "company"
            ? `<b>${n.name}</b>`
            : `<b>${n.name}</b>${
                n.status === "ok" ? ` — ${Math.round(n.confidence * 100)}%` : " — no evidence"
              }<br/><span style="font-size:11px">${n.firstBullet}</span>`
        }
        linkColor={() => "#DDDDD5"}
        linkOpacity={0.4}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.006}
        onNodeClick={(n: any) => {
          if (n.kind === "block" && blockById[n.id]) onSelectBlock(blockById[n.id]);
        }}
      />

      <div className={styles.legend}>
        <div className={styles.legendRow}>
          <span className={styles.dot} style={{ background: POS }} /> High confidence
        </div>
        <div className={styles.legendRow}>
          <span className={styles.dot} style={{ background: WARN }} /> Medium
        </div>
        <div className={styles.legendRow}>
          <span className={styles.dot} style={{ background: MUTE }} /> No / low evidence
        </div>
      </div>
    </div>
  );
}
