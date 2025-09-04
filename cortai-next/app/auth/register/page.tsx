"use client";

import { SignUp } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Criar conta</CardTitle>
          <CardDescription>Registre-se para começar</CardDescription>
        </CardHeader>
        <CardContent>
          <SignUp
            appearance={{
              elements: {
                formButtonPrimary: "bg-primary hover:opacity-90",
              },
            }}
            signInUrl="/auth/login"
            redirectUrl="/dashboard"
          />
        </CardContent>
      </Card>
    </div>
  );
}

