import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The identity voice: labels, timestamps, modeline, tool chips.
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ecode — AI Coding Agent",
  description:
    "A local-first AI coding agent: 450+ models via OpenRouter, plan mode, live thinking, sandboxed tools, approval gates, diffs with undo, and a full audit trail.",
  keywords: ["Ecode", "AI agent", "coding agent", "OpenRouter", "developer tools", "terminal"],
  icons: {
    icon: "/logo.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0a09",
};

// Pre-paint appearance bootstrap — reads the persisted UI store from
// localStorage and stamps data-accent / data-density / data-times on <html>
// before first paint so there is never a flash of the wrong theme.
const appearanceBootstrap = `(function(){try{
  var raw = localStorage.getItem("ecode-ui");
  var a = raw ? (JSON.parse(raw).state||{}).appearance||{} : {};
  var d = document.documentElement;
  d.setAttribute("data-accent", a.accent||"amber");
  d.setAttribute("data-density", a.density||"normal");
  d.setAttribute("data-times", a.times===false?"off":"on");
}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrap }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${jetbrains.variable} antialiased bg-stone-950 text-stone-200`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
