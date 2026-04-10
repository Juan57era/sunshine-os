import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrains = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SUNSHINE OS",
  description: "Business intelligence agent — $30K/mes",
};

export const viewport: Viewport = {
  themeColor: "#030810",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${jetbrains.variable} h-full`}>
      <body className="min-h-full flex flex-col font-mono">{children}</body>
    </html>
  );
}
