import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Cortaí",
  description: "Transforme vídeos longos em conteúdo viral",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="pt-BR">
        <body>
          <Navbar />
          <main className="container py-8">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}

