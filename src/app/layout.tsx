import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { SCRIPT_TEMA } from "@/components/tema";
import "./globals.css";

// Fontes do design (docs/DESIGN.md): Archivo (texto) e IBM Plex Mono (rótulos, IDs, números).
const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-archivo", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = { title: "Plexu", description: "Board que nasce kanban e cresce até ERP." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${archivo.variable} ${plexMono.variable}`}>
      <head>
        {/* Tema antes da pintura (sem flash): localStorage, senão o sistema. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <Toaster richColors position="bottom-right" closeButton />
      </body>
    </html>
  );
}
