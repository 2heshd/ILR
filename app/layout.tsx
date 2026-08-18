import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ILR Persian",
  description: "Adaptive Persian study system for ILR R4 / L3+ / S2",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
