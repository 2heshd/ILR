import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./overrides.css";

const googleSansCode = localFont({
  src: "./fonts/GoogleSansCode_Proportional-Light.ttf",
  display: "swap",
  weight: "300",
  style: "normal",
  variable: "--font-google-sans-code",
});

export const metadata: Metadata = {
  title: "ILR Persian",
  description: "Adaptive Persian study system for ILR R4 / L3+ / S2",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={googleSansCode.variable}>
      <body>{children}</body>
    </html>
  );
}
