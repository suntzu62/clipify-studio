import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
}

interface AuthError {
  message: string;
  code?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    console.log('[AuthContext] Checking authentication...');
    console.log('[AuthContext] BACKEND_URL:', BACKEND_URL);

    try {
      console.log('[AuthContext] Calling /auth/me (cookie-based auth)');
      const response = await fetch(`${BACKEND_URL}/auth/me`, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Send httpOnly cookies automatically
      });

      console.log('[AuthContext] /auth/me response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('[AuthContext] User authenticated successfully:', data.user.email);
        setUser(data.user);
      } else {
        // Token inválido ou expirado (cookie será limpo no logout)
        const errorText = await response.text();
        console.error('[AuthContext] Authentication failed:', response.status, errorText);
        setUser(null);
      }
    } catch (error) {
      console.error('[AuthContext] Failed to fetch user:', error);
      setUser(null);
    }
  };

  // Check for existing JWT token on mount (token is in httpOnly cookie)
  useEffect(() => {
    const checkAuth = async () => {
      await fetchUser();
      console.log('[AuthContext] Loading complete');
      setLoading(false);
    };

    checkAuth();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      console.log('[AuthContext] signIn called for email:', email);
      const response = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Send and receive cookies
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      console.log('[AuthContext] Login response status:', response.status);

      if (!response.ok) {
        console.error('[AuthContext] Login failed:', data);
        return {
          error: {
            message: data.message || 'Login failed',
            code: data.error,
          },
        };
      }

      // Tokens are now in httpOnly cookies (set by backend)
      console.log('[AuthContext] Login successful, tokens set in httpOnly cookies');
      console.log('[AuthContext] Setting user:', data.user.email);
      setUser(data.user);

      return { error: null };
    } catch (error) {
      console.error('[AuthContext] Sign in error:', error);
      return {
        error: {
          message: 'Network error. Please try again.',
        },
      };
    }
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Send and receive cookies
        body: JSON.stringify({ email, password, fullName }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          error: {
            message: data.message || 'Registration failed',
            code: data.error,
          },
        };
      }

      // Tokens are now in httpOnly cookies (set by backend)
      console.log('[AuthContext] Registration successful, tokens set in httpOnly cookies');
      setUser(data.user);

      return { error: null };
    } catch (error) {
      console.error('Sign up error:', error);
      return {
        error: {
          message: 'Network error. Please try again.',
        },
      };
    }
  };

  const signOut = async () => {
    try {
      await fetch(`${BACKEND_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Send cookies to clear them
      });
      console.log('[AuthContext] Logged out successfully, cookies cleared');
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      // Clear local state (cookies are cleared by backend)
      setUser(null);
    }
  };

  const getToken = async () => {
    // Tokens are now in httpOnly cookies and sent automatically with credentials: 'include'
    // This function returns null since cookies can't be accessed from JavaScript (security feature)
    // Use the `user` object to get user information instead
    return null;
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    getToken,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
