import type { Metadata, Viewport } from "next";
import { Geist_Mono, Press_Start_2P } from "next/font/google";
import Providers from "./providers";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const arcade = Press_Start_2P({
  variable: "--font-arcade",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "freefall",
  description: "an onchain arcade game on Base",
  other: {
    "base:app_id": "6a2a5ec065478aa1565a9ea3",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#05060d",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistMono.variable} ${arcade.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
