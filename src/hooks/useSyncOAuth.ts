/**
 * useSyncOAuth Hook
 *
 * DEPRECATED: This hook was used to sync OAuth tokens from Clerk to Supabase.
 * Since we removed Clerk and now use Supabase Auth directly, this hook is no longer needed.
 * OAuth tokens are now managed automatically by Supabase when users sign in with Google.
 *
 * This hook is kept as a no-op for backward compatibility but does nothing.
 */
export function useSyncOAuth() {
  // No-op: OAuth tokens are now managed directly by Supabase Auth
  // When users sign in with Google via Supabase, tokens are automatically stored
  // and can be accessed via supabase.auth.getSession()
}
