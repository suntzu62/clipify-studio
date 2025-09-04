import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Bem-vindo, {user.name || user.email}</p>
      </div>

      <div className="flex items-center gap-3">
        <Link href="/projects"><Button variant="outline">Meus Projetos</Button></Link>
        <Link href="/settings"><Button variant="outline">Configurações</Button></Link>
        <SignOutButton signOutCallback={() => {}}>
          <Button> Sair </Button>
        </SignOutButton>
      </div>
    </div>
  );
}

