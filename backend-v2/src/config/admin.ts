/**
 * Admin Configuration
 * SECURITY: The super admin email is hardcoded and cannot be changed via UI or database
 */

// Super Admin Email - HARDCODED for security
export const SUPER_ADMIN_EMAIL = 'gabrielfootze@gmail.com';

/**
 * Check if an email belongs to the super admin
 * @param email - Email to check
 * @returns true if the email is the super admin
 */
export function isSuperAdmin(email: string | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}
