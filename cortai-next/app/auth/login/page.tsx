"use client";

import { SignIn } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Entrar</CardTitle>
          <CardDescription>Acesse sua conta para continuar</CardDescription>
        </CardHeader>
        <CardContent>
          <SignIn
            appearance={{
              elements: {
                formButtonPrimary: "bg-primary hover:opacity-90",
              },
            }}
            signUpUrl="/auth/register"
            redirectUrl="/dashboard"
          />
        </CardContent>
      </Card>
    </div>
  );
}

