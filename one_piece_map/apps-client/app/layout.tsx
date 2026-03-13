import type { Metadata } from "next";
import { Cinzel, Geist_Mono, Spectral } from "next/font/google";
import "./globals.css";

const atlasDisplay = Cinzel({
  variable: "--font-atlas-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const atlasBody = Spectral({
  variable: "--font-atlas-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const atlasMono = Geist_Mono({
  variable: "--font-atlas-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "One Piece World Atlas",
  description: "Carte interactive de l'univers One Piece pour explorer les îles, arcs et informations clés.",
  applicationName: "One Piece World Atlas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${atlasDisplay.variable} ${atlasBody.variable} ${atlasMono.variable} atlas-shell antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
