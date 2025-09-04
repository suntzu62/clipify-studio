import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Cortaí</h1>
      <p className="text-muted-foreground">Plataforma para transformar vídeos longos em clipes virais.</p>
      <div className="flex gap-3">
        <Link href="/dashboard" className="underline">Ir para Dashboard</Link>
        <Link href="/auth/login" className="underline">Entrar</Link>
      </div>
    </div>
  );
}

