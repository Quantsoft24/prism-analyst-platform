import type { Metadata } from "next";
import { fraunces, interTight, jetbrainsMono } from "@/styles/fonts";
import { ToastProvider } from "@/components/Toast";
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
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
