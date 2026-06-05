"use client";

import Link from "next/link";

import { useQuota } from "@/lib/api/quota";
import styles from "./QuotaNotice.module.css";

/**
 * "N messages left today" notice. Always shown for guests (with a sign-in
 * nudge); for signed-in users only when running low (≤5). Hidden when the
 * limiter is off. Driven by `/api/v1/chat/quota`.
 */
export default function QuotaNotice() {
  const { data } = useQuota();
  if (!data || !data.enabled) return null;
  if (!data.is_anonymous && data.remaining > 5) return null;

  const none = data.remaining <= 0;
  return (
    <div className={none ? styles.alert : styles.notice}>
      {data.is_anonymous ? (
        none ? (
          <>
            You&apos;ve used all {data.limit} free guest messages today.{" "}
            <Link className={styles.link} href="/sign-in">Sign in</Link> to keep going.
          </>
        ) : (
          <>
            Guest mode · {data.remaining} of {data.limit} messages left today ·{" "}
            <Link className={styles.link} href="/sign-in">Sign in</Link> for more.
          </>
        )
      ) : none ? (
        <>You&apos;ve reached your daily limit of {data.limit} messages. It resets tomorrow.</>
      ) : (
        <>{data.remaining} of {data.limit} messages left today.</>
      )}
    </div>
  );
}
