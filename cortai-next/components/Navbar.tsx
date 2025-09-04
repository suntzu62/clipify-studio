"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton, useUser } from "@clerk/nextjs";

export default function Navbar() {
  const { user } = useUser();
  return (
    <header className="border-b border-border bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="container h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-sm">C</span>
          </div>
          <span className="text-xl font-bold">Cortaí</span>
        </Link>

        <nav className="flex items-center gap-4">
          <SignedIn>
            <Link href="/dashboard" className="hover:text-primary">Dashboard</Link>
            <Link href="/projects" className="hover:text-primary">Meus Projetos</Link>
            <Link href="/settings" className="hover:text-primary">Configurações</Link>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:inline">{user?.fullName || user?.primaryEmailAddress?.emailAddress}</span>
              <UserButton afterSignOutUrl="/auth/login" />
            </div>
          </SignedIn>
          <SignedOut>
            <Link href="/auth/login" className="hover:text-primary">Entrar</Link>
          </SignedOut>
        </nav>
      </div>
    </header>
  );
}

