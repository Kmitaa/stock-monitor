import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AmbientGradient } from "@/components/ambient-gradient";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Market Monitor AI",
  description: "Market terminal with AI-assisted analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full w-full antialiased`}
    >
      <body className="relative min-h-full w-full flex flex-col overflow-x-hidden bg-black text-white">
        <AmbientGradient />
        <Providers>
          <div className="relative z-10 flex min-h-full w-full flex-1 flex-col">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
