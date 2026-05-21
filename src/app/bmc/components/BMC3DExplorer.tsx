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

// Vibrant per-block palette + emoji icons — ported from PRISM_ANALYST's BMC so
// the 3D canvas has the same recognisable, multi-coloured node identity.
const BMC_COLORS: Record<string, string> = {
  customer_segments: "#4FC3F7",
  value_propositions: "#00E5FF",
  channels: "#00E676",
  customer_relationships: "#FF4081",
  revenue_streams: "#FFD740",
  key_resources: "#FF6E40",
  key_activities: "#18FFFF",
  key_partners: "#B388FF",
  cost_structure: "#FF5252",
};

const BMC_ICONS: Record<string, string> = {
  customer_segments: "👥",
  value_propositions: "💎",
  channels: "📡",
  customer_relationships: "🤝",
  revenue_streams: "💰",
  key_resources: "🔑",
  key_activities: "⚙️",
  key_partners: "🧩",
  cost_structure: "📊",
};

const BMC_SHORT: Record<string, string> = {
  customer_segments: "Cust. Segments",
  value_propositions: "Value Propositions",
  channels: "Channels",
  customer_relationships: "Customer Relationships",
  revenue_streams: "Revenue Streams",
  key_resources: "Key Resources",
  key_activities: "Key Activities",
  key_partners: "Key Partners",
  cost_structure: "Cost Structure",
};

const CENTER_COLOR = "#00BCD4";
const FALLBACK_NODE = "#7C4DFF";

interface GNode {
  id: string;
  shortLabel: string;
  desc: string;
  color: string;
  icon: string;
  isCenter?: boolean;
  block?: BMCBlock;
  x?: number;
  y?: number;
  z?: number;
}
interface GLink {
  source: string;
  target: string;
}

function blockDesc(b: BMCBlock): string {
  const first = b.summary_bullets[0] ?? (b.status === "ok" ? "" : "No filing evidence.");
  // Strip [n] citation markers for the floating label / tooltip preview.
  return first.replace(/\[[\d,\s]+\]/g, "").trim();
}

function buildCenterOnly(company: string): { nodes: GNode[]; links: GLink[] } {
  return {
    nodes: [
      {
        id: "center",
        shortLabel: company.toUpperCase(),
        desc: "Click to explore the Business Model Canvas",
        color: CENTER_COLOR,
        icon: "🏢",
        isCenter: true,
      },
    ],
    links: [],
  };
}

function buildFullGraph(bmc: BMC): { nodes: GNode[]; links: GLink[] } {
  const center: GNode = {
    id: "center",
    shortLabel: bmc.ticker.toUpperCase(),
    desc: "",
    color: CENTER_COLOR,
    icon: "🏢",
    isCenter: true,
  };
  const nodes: GNode[] = bmc.blocks.map((b) => ({
    id: b.block_id,
    shortLabel: BMC_SHORT[b.block_id] ?? b.title,
    desc: blockDesc(b),
    color: BMC_COLORS[b.block_id] ?? FALLBACK_NODE,
    icon: BMC_ICONS[b.block_id] ?? "📋",
    block: b,
  }));
  const links: GLink[] = bmc.blocks.map((b) => ({ source: "center", target: b.block_id }));
  return { nodes: [center, ...nodes], links };
}

/**
 * Interactive 3D force-graph view of a canvas, styled to match PRISM_ANALYST's
 * signature BMC: a glowing cyan energy-core company node with luminous
 * glass-bubble blocks radiating out, curved colour-matched links with flowing
 * particles, progressive reveal (click the core to expand), and hover preview.
 *
 * Secondary view — the 2D canvas stays the primary, analyst-facing surface.
 */
export default function BMC3DExplorer({ bmc, onSelectBlock }: BMC3DExplorerProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const graphRef = React.useRef<any>(null);
  const [size, setSize] = React.useState({ w: 800, h: 560 });
  const [expanded, setExpanded] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [hovered, setHovered] = React.useState<GNode | null>(null);
  const [tooltipPos, setTooltipPos] = React.useState<{ x: number; y: number } | null>(null);

  const [graphData, setGraphData] = React.useState(() => buildCenterOnly(bmc.ticker));

  // Rebuild (and collapse to the core) whenever the canvas changes.
  React.useEffect(() => {
    setExpanded(false);
    setSelectedId(null);
    setHovered(null);
    setGraphData(buildCenterOnly(bmc.ticker));
  }, [bmc]);

  // Track container size so the canvas fills it responsively.
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const expand = React.useCallback(() => {
    setExpanded(true);
    setGraphData(buildFullGraph(bmc));
    setTimeout(() => {
      graphRef.current?.cameraPosition({ x: 0, y: -10, z: 170 }, { x: 0, y: -10, z: 0 }, 1200);
    }, 60);
  }, [bmc]);

  const handleNodeClick = React.useCallback(
    (node: any) => {
      if (node.isCenter) {
        if (!expanded) expand();
        return;
      }
      if (!node.block) return;
      setSelectedId(node.id);
      onSelectBlock(node.block as BMCBlock);
      // Orbital pan that keeps the core in frame.
      if (graphRef.current) {
        const nx = node.x || 0;
        const nz = node.z || 0;
        const cx = nx - nz;
        const cz = nx + nz;
        const len = Math.hypot(cx, cz) || 1;
        const dist = 160;
        graphRef.current.cameraPosition(
          { x: (cx / len) * dist, y: (node.y || 0) * 0.4 - 12, z: (cz / len) * dist },
          { x: 0, y: -10, z: 0 },
          1200,
        );
      }
    },
    [expanded, expand, onSelectBlock],
  );

  const handleNodeHover = React.useCallback((node: any) => {
    if (node && !node.isCenter && node.x !== undefined && graphRef.current) {
      setHovered(node as GNode);
      const c = graphRef.current.graph2ScreenCoords(node.x, node.y, node.z);
      setTooltipPos({ x: c.x + 22, y: c.y - 18 });
    } else {
      setHovered(null);
      setTooltipPos(null);
    }
    if (typeof document !== "undefined") {
      document.body.style.cursor = node ? "pointer" : "default";
    }
  }, []);

  // Custom three.js node rendering — energy core + glass bubbles. Lazy-require
  // three so this client component never touches WebGL during SSR.
  const nodeThreeObject = React.useCallback(
    (node: any) => {
      if (typeof window === "undefined") return null;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const THREE = require("three");
      const group = new THREE.Group();
      const isSel = selectedId === node.id;
      const isDimmed = selectedId && !isSel && !node.isCenter;

      const sprite = (canvas: HTMLCanvasElement, sx: number, sy: number, y = 0, additive = false) => {
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        const mat = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          ...(additive ? { blending: THREE.AdditiveBlending } : {}),
        });
        const sp = new THREE.Sprite(mat);
        sp.scale.set(sx, sy, 1);
        sp.position.set(0, y, 0);
        group.add(sp);
        return sp;
      };

      if (node.isCenter) {
        // White core + cyan glow spheres.
        group.add(new THREE.Mesh(new THREE.SphereGeometry(6, 32, 32), new THREE.MeshBasicMaterial({ color: "#ffffff" })));
        group.add(
          new THREE.Mesh(
            new THREE.SphereGeometry(9, 32, 32),
            new THREE.MeshBasicMaterial({ color: "#00e5ff", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }),
          ),
        );
        // Radial halo sprite.
        const halo = document.createElement("canvas");
        halo.width = halo.height = 128;
        const hctx = halo.getContext("2d");
        if (hctx) {
          const g = hctx.createRadialGradient(64, 64, 30, 64, 64, 64);
          g.addColorStop(0, "rgba(0,229,255,0.8)");
          g.addColorStop(1, "rgba(0,229,255,0)");
          hctx.fillStyle = g;
          hctx.beginPath();
          hctx.arc(64, 64, 64, 0, Math.PI * 2);
          hctx.fill();
          sprite(halo, 40, 40, 0, true);
        }
        // Orbital rings.
        group.add(
          new THREE.Mesh(
            new THREE.TorusGeometry(12, 0.2, 16, 100),
            new THREE.MeshBasicMaterial({ color: "#00e5ff", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
          ),
        );
        const r2 = new THREE.Mesh(
          new THREE.TorusGeometry(16, 0.1, 16, 100),
          new THREE.MeshBasicMaterial({ color: "#00bcd4", transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending }),
        );
        r2.rotation.x = Math.PI / 6;
        group.add(r2);
        if (!expanded) {
          group.add(
            new THREE.Mesh(
              new THREE.TorusGeometry(20, 0.2, 16, 100),
              new THREE.MeshBasicMaterial({ color: "#00e5ff", transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending }),
            ),
          );
        }
        // Label.
        const lc = document.createElement("canvas");
        lc.width = 512;
        lc.height = 100;
        const lctx = lc.getContext("2d");
        if (lctx) {
          lctx.clearRect(0, 0, 512, 100);
          lctx.font = "bold 30px Inter, system-ui, sans-serif";
          lctx.fillStyle = "#ffffff";
          lctx.textAlign = "center";
          lctx.textBaseline = "middle";
          lctx.fillText(node.shortLabel.substring(0, 28), 256, expanded ? 40 : 35);
          if (!expanded) {
            lctx.font = "18px Inter, system-ui, sans-serif";
            lctx.fillStyle = "rgba(0,230,255,0.75)";
            lctx.fillText("Click to explore →", 256, 68);
          }
          sprite(lc, 36, 7, -25);
        }
      } else {
        const col = new THREE.Color(node.color);
        const dimFactor = isDimmed ? 0.45 : 1;
        const alpha = (isSel ? 1 : 0.7) * dimFactor;

        // Glass bubble (radial gradient + edge stroke).
        const bub = document.createElement("canvas");
        bub.width = bub.height = 128;
        const bctx = bub.getContext("2d");
        if (bctx) {
          const r = 60;
          const rgb = `${col.r * 255}, ${col.g * 255}, ${col.b * 255}`;
          const grad = bctx.createRadialGradient(64, 64, 0, 64, 64, r);
          grad.addColorStop(0, `rgba(${rgb}, 0.1)`);
          grad.addColorStop(0.8, `rgba(${rgb}, 0.3)`);
          grad.addColorStop(1, `rgba(${rgb}, 0.8)`);
          bctx.fillStyle = grad;
          bctx.beginPath();
          bctx.arc(64, 64, r, 0, Math.PI * 2);
          bctx.fill();
          bctx.strokeStyle = `rgba(${rgb}, 1)`;
          bctx.lineWidth = 4;
          bctx.stroke();
          const bs = sprite(bub, 16, 16, 0, true);
          (bs.material as any).opacity = alpha;
        }
        // Icon.
        const ic = document.createElement("canvas");
        ic.width = ic.height = 128;
        const ictx = ic.getContext("2d");
        if (ictx) {
          ictx.clearRect(0, 0, 128, 128);
          ictx.font = "80px serif";
          ictx.textAlign = "center";
          ictx.textBaseline = "middle";
          ictx.globalAlpha = dimFactor;
          ictx.shadowColor = `rgba(${col.r * 255}, ${col.g * 255}, ${col.b * 255}, 0.8)`;
          ictx.shadowBlur = 10;
          ictx.fillText(node.icon || "📋", 64, 64);
          sprite(ic, 11, 11, 0).position.set(0, 0, 0.1);
        }
        // Title + one-line description.
        const tc = document.createElement("canvas");
        tc.width = 420;
        tc.height = 110;
        const tctx = tc.getContext("2d");
        if (tctx) {
          tctx.clearRect(0, 0, 420, 110);
          tctx.globalAlpha = dimFactor;
          tctx.font = `bold ${isSel ? "24px" : "20px"} Inter, system-ui, sans-serif`;
          tctx.fillStyle = isSel ? "#ffffff" : "#c8d0e8";
          tctx.textAlign = "center";
          tctx.textBaseline = "top";
          tctx.fillText(node.shortLabel.substring(0, 24), 210, 6);
          tctx.font = "14px Inter, system-ui, sans-serif";
          tctx.fillStyle = isSel ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.6)";
          const d = (node.desc || "").substring(0, 50);
          tctx.fillText(d ? d + (node.desc.length > 50 ? "…" : "") : "—", 210, 36);
          sprite(tc, 34, 9, -9);
        }
        if (isSel) {
          group.add(
            new THREE.Mesh(
              new THREE.SphereGeometry(14, 32, 32),
              new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending }),
            ),
          );
        }
      }
      return group;
    },
    [selectedId, expanded],
  );

  const nodeColorOf = (id: string): string => {
    const n = graphData.nodes.find((x) => x.id === id);
    return n ? n.color : CENTER_COLOR;
  };

  const zoomBy = (factor: number) => {
    const g = graphRef.current;
    if (!g) return;
    const c = g.camera();
    g.cameraPosition({ x: c.position.x * factor, y: c.position.y * factor, z: c.position.z * factor }, undefined, 400);
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.hint}>
        {expanded ? "Drag to rotate · scroll to zoom · click a block" : "Click the core to expand the canvas"}
      </div>

      <ForceGraph3D
        ref={graphRef}
        width={size.w}
        height={size.h}
        graphData={graphData}
        backgroundColor="#0a0e1a"
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        enableNodeDrag
        enableNavigationControls
        showNavInfo={false}
        cooldownTime={3000}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        linkColor={(l: any) => {
          const tid = typeof l.target === "string" ? l.target : l.target?.id;
          const col = nodeColorOf(tid);
          return selectedId && selectedId !== tid ? `${col}44` : `${col}aa`;
        }}
        linkWidth={(l: any) => {
          if (!selectedId) return 1.5;
          const tid = typeof l.target === "string" ? l.target : l.target?.id;
          return tid === selectedId ? 4.5 : 1.2;
        }}
        linkOpacity={0.9}
        linkResolution={24}
        linkCurvature={0.25}
        linkCurveRotation={(l: any) => {
          let hash = 0;
          const str = (typeof l.target === "string" ? l.target : l.target?.id) || "";
          for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
          return ((Math.abs(hash) % 100) / 100) * Math.PI * 2;
        }}
        linkDirectionalParticles={(l: any) => {
          if (!selectedId) return 3;
          const tid = typeof l.target === "string" ? l.target : l.target?.id;
          return tid === selectedId ? 6 : 1;
        }}
        linkDirectionalParticleWidth={(l: any) => {
          if (!selectedId) return 3;
          const tid = typeof l.target === "string" ? l.target : l.target?.id;
          return tid === selectedId ? 4.5 : 1;
        }}
        linkDirectionalParticleSpeed={0.0035}
        linkDirectionalParticleColor={(l: any) => {
          const tid = typeof l.target === "string" ? l.target : l.target?.id;
          return nodeColorOf(tid);
        }}
      />

      {/* Hover preview — positioned beside the node */}
      {hovered && tooltipPos && (
        <div className={styles.tooltip} style={{ left: tooltipPos.x, top: tooltipPos.y }}>
          <div className={styles.tooltipTitle}>
            {hovered.icon} {hovered.shortLabel}
          </div>
          <div className={styles.tooltipDesc}>{hovered.desc || "No filing evidence for this block."}</div>
        </div>
      )}

      {/* Camera controls */}
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlBtn}
          title="Reset view"
          onClick={() =>
            graphRef.current?.cameraPosition(
              expanded ? { x: 0, y: -10, z: 170 } : { x: 0, y: 0, z: 300 },
              { x: 0, y: expanded ? -10 : 0, z: 0 },
              800,
            )
          }
        >
          ⟳
        </button>
        <button type="button" className={styles.controlBtn} title="Zoom in" onClick={() => zoomBy(0.8)}>
          +
        </button>
        <button type="button" className={styles.controlBtn} title="Zoom out" onClick={() => zoomBy(1.3)}>
          −
        </button>
      </div>
    </div>
  );
}
