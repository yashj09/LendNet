import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LendNet - P2P Agent Lending Network",
  description:
    "Autonomous AI agents negotiating and settling USDT loans via Tether WDK",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0a0a0f] text-[#e4e4ef] min-h-screen font-mono antialiased">
        {children}
      </body>
    </html>
  );
}
