import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AutoReload } from "@/components/AutoReload";
import "./globals.css";

export const metadata: Metadata = {
  title: "MailPalace",
  description: "Local-first email AI agent.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      {/* `suppressHydrationWarning` is intentional: browser extensions
          (Bitwarden, password managers, accessibility tools) inject
          attributes into <body> before React hydrates, which is otherwise
          flagged as a mismatch. */}
      <body suppressHydrationWarning>
        <AutoReload />
        {children}
      </body>
    </html>
  );
}
