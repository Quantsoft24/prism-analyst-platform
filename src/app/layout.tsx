import type { Metadata } from "next";

import { Providers } from "@/app/providers";
import { fraunces, interTight, jetbrainsMono } from "@/styles/fonts";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "PRISM — AI Equity Research Analyst",
  description:
    "AI-powered equity research platform. Ask anything about companies, filings, sectors, or funds.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${fraunces.variable} ${interTight.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
