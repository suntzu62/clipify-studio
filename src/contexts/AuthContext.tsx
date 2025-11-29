import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const API_KEY = import.meta.env.VITE_API_KEY || '';

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

  // Check for existing JWT token on mount
  useEffect(() => {
    const checkAuth = async () => {
      console.log('[AuthContext] Checking authentication...');
      const token = localStorage.getItem('access_token');
      console.log('[AuthContext] Token from localStorage:', token ? 'EXISTS' : 'NOT FOUND');
      console.log('[AuthContext] BACKEND_URL:', BACKEND_URL);
      console.log('[AuthContext] API_KEY:', API_KEY ? 'SET' : 'MISSING');

      if (!token) {
        console.log('[AuthContext] No token found, user not authenticated');
        setLoading(false);
        return;
      }

      try {
        console.log('[AuthContext] Calling /auth/me with token');
        const response = await fetch(`${BACKEND_URL}/auth/me`, {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
            'Authorization': `Bearer ${token}`,
          },
        });

        console.log('[AuthContext] /auth/me response status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('[AuthContext] User authenticated successfully:', data.user.email);
          setUser(data.user);
        } else {
          // Token inválido ou expirado
          const errorText = await response.text();
          console.error('[AuthContext] Authentication failed:', response.status, errorText);
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          setUser(null);
        }
      } catch (error) {
        console.error('[AuthContext] Failed to fetch user:', error);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        setUser(null);
      } finally {
        console.log('[AuthContext] Loading complete');
        setLoading(false);
      }
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
          'x-api-key': API_KEY,
        },
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

      // Save tokens to localStorage
      console.log('[AuthContext] Saving tokens to localStorage');
      localStorage.setItem('access_token', data.accessToken);
      localStorage.setItem('refresh_token', data.refreshToken);
      console.log('[AuthContext] Tokens saved successfully');

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
          'x-api-key': API_KEY,
        },
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

      // Save tokens to localStorage
      localStorage.setItem('access_token', data.accessToken);
      localStorage.setItem('refresh_token', data.refreshToken);

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
          'x-api-key': API_KEY,
        },
      });
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      // Always clear local state
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      setUser(null);
    }
  };

  const getToken = async () => {
    return localStorage.getItem('access_token');
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    getToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
