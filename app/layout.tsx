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
  title: "Cursos",
  description: "Adaptive Persian study system for reading, listening, speaking, and recall",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={googleSansCode.variable}>
      <body>{children}</body>
    </html>
  );
}
