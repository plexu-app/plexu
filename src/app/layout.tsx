import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = { title: "Plexu", description: "Board que nasce kanban e cresce até ERP." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        {children}
        <Toaster richColors position="bottom-right" closeButton />
      </body>
    </html>
  );
}
