"use client";

import * as React from "react";

import type { Security } from "@/lib/api/stocks";

import AskPrismPrompts from "./AskPrismPrompts";
import FeaturedPreview from "./FeaturedPreview";
import IndicesStrip from "./IndicesStrip";
import PopularStocks from "./PopularStocks";
import RecentlyViewed from "./RecentlyViewed";
import TopMovers from "./TopMovers";
import styles from "./stocks.module.css";

/**
 * Stock Dashboard landing — a market home screen shown before any company is
 * selected (replaces the old empty state). Indices strip → [top movers | recent
 * + popular] → featured preview → Ask-PRISM prompts. Every entry point calls
 * `onSelect`, which opens the full dashboard for that security.
 */
export default function MarketOverview({
  recent,
  onSelect,
  onAsk,
}: {
  recent: Security[];
  onSelect: (s: Security) => void;
  onAsk?: (query: string) => void;
}) {
  return (
    <div className={styles.overview}>
      <IndicesStrip />

      <div className={styles.overviewGrid}>
        <TopMovers onSelect={onSelect} />
        <div className={styles.sideCol}>
          <RecentlyViewed recent={recent} onSelect={onSelect} />
          <PopularStocks onSelect={onSelect} />
        </div>
      </div>

      <FeaturedPreview recent={recent} onSelect={onSelect} />
      <AskPrismPrompts onAsk={onAsk} />
    </div>
  );
}
