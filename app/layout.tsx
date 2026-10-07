import type { Metadata } from "next";
import { Rubik, Space_Mono, Kalam } from "next/font/google";

import "./globals.css";

const rubik = Rubik({
  subsets: ["latin"],
  variable: "--font-rubik",
  weight: ["400", "500", "600", "700"],
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-space-mono",
  weight: ["400", "700"],
});

const kalam = Kalam({
  subsets: ["latin"],
  variable: "--font-kalam",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Huddle | Shared canvas",
  description:
    "Open a temporary Huddle canvas, share the code, and turn scattered ideas into shared direction.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${rubik.variable} ${spaceMono.variable} ${kalam.variable}`}
      >
        {children}
      </body>
    </html>
  );
}