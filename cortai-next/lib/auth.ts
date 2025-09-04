import { currentUser } from "@clerk/nextjs/server";

export async function getCurrentUser() {
  const user = await currentUser();
  if (!user) return null;
  return {
    id: user.id,
    name: user.fullName || undefined,
    email: user.primaryEmailAddress?.emailAddress || undefined,
  };
}

