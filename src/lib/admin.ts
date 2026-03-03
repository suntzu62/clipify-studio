const DEFAULT_ADMIN_EMAIL = 'gabrielfootze@gmail.com';

export const ADMIN_EMAIL = (
  import.meta.env.VITE_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL
).toLowerCase();

export const isAdminEmail = (email?: string | null): boolean => {
  if (!email) return false;
  return email.toLowerCase() === ADMIN_EMAIL;
};
