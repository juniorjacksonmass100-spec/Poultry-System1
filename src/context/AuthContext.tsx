import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../services/supabase';
import { UserProfile, UserRole } from '../types';

export const ADMIN_EMAIL = 'junior.jacksonmass100@gmail.com';
export const ADMIN_NAME = 'Junior Jackson';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  role: UserRole;
  isAdmin: boolean;
  loading: boolean;
  isConfigured: boolean;
  allProfiles: UserProfile[];
  refreshProfiles: () => Promise<void>;
  signUp: (email: string, password: string, fullName: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ALL_PROFILES_CACHE = 'kgp_all_profiles_cache';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRoleState] = useState<UserRole>('user');
  const [loading, setLoading] = useState<boolean>(true);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>(() => {
    try {
      const cached = localStorage.getItem(ALL_PROFILES_CACHE);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const isConfigured = isSupabaseConfigured();

  const fetchAllProfiles = useCallback(async () => {
    if (!isConfigured) return;
    try {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setAllProfiles(data as UserProfile[]);
        try {
          localStorage.setItem(ALL_PROFILES_CACHE, JSON.stringify(data));
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.warn('Error fetching system user profiles:', err);
    }
  }, [isConfigured]);

  const loadProfile = useCallback(async (userId: string, email: string) => {
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.from('profiles').select('*').eq('id', userId).single();
      const isJuniorAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

      const nowIso = new Date().toISOString();

      if (!error && data) {
        let effectiveRole: UserRole = isJuniorAdmin ? 'admin' : (data.role || 'user');
        
        try {
          await client.from('profiles').update({
            role: effectiveRole,
            last_sign_in_at: nowIso,
            is_online: true,
            updated_at: nowIso,
          }).eq('id', userId);
        } catch {
          // ignore network failure on update
        }

        const updatedProfile: UserProfile = {
          ...data,
          role: effectiveRole,
          last_sign_in_at: nowIso,
          is_online: true,
        };

        setProfile(updatedProfile);
        setRoleState(effectiveRole);
      } else {
        const newProfile: UserProfile = {
          id: userId,
          email,
          role: isJuniorAdmin ? 'admin' : 'user',
          full_name: isJuniorAdmin ? ADMIN_NAME : (email.split('@')[0] || 'Staff Member'),
          created_at: nowIso,
          updated_at: nowIso,
          last_sign_in_at: nowIso,
          is_online: true,
        };
        try {
          await client.from('profiles').upsert([newProfile]);
        } catch {
          // ignore
        }
        setProfile(newProfile);
        setRoleState(isJuniorAdmin ? 'admin' : 'user');
      }

      await fetchAllProfiles();
    } catch (err) {
      console.warn('Error loading user profile:', err);
    }
  }, [fetchAllProfiles]);

  useEffect(() => {
    // Safety watchdog: ensure loading is NEVER stuck true for more than 2 seconds
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 2000);

    if (!isConfigured) {
      setUser(null);
      setProfile(null);
      setRoleState('user');
      setLoading(false);
      clearTimeout(timeout);
      return;
    }

    try {
      const client = getSupabaseClient();
      client.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setSession(session);
          setUser(session.user);
          loadProfile(session.user.id, session.user.email || '');
        }
        setLoading(false);
      }).catch(() => {
        setLoading(false);
      });

      const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
        setSession(session);
        setUser(session?.user || null);
        if (session?.user) {
          loadProfile(session.user.id, session.user.email || '');
        } else {
          setProfile(null);
          setRoleState('user');
        }
        setLoading(false);
      });

      fetchAllProfiles();

      return () => {
        clearTimeout(timeout);
        subscription.unsubscribe();
      };
    } catch {
      setLoading(false);
    }
  }, [isConfigured, loadProfile, fetchAllProfiles]);

  const signUp = async (email: string, password: string, fullName: string, _initialRole: UserRole = 'user') => {
    if (!isConfigured) {
      return {
        success: false,
        error: 'Supabase is not configured yet. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first.',
      };
    }

    const cleanEmail = email.trim().toLowerCase();
    const isJuniorAdmin = cleanEmail === ADMIN_EMAIL.toLowerCase();
    const effectiveRole: UserRole = isJuniorAdmin ? 'admin' : 'user';
    const effectiveName = isJuniorAdmin ? ADMIN_NAME : fullName;
    const nowIso = new Date().toISOString();

    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: effectiveName,
            role: effectiveRole,
          },
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        setUser(data.user);
        const newProfile: UserProfile = {
          id: data.user.id,
          email: data.user.email || cleanEmail,
          full_name: effectiveName,
          role: effectiveRole,
          created_at: nowIso,
          updated_at: nowIso,
          last_sign_in_at: nowIso,
          is_online: true,
        };
        try {
          await client.from('profiles').upsert([newProfile]);
        } catch {
          // ignore
        }
        setProfile(newProfile);
        setRoleState(effectiveRole);
        await fetchAllProfiles();
      }

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Sign up failed' };
    }
  };

  const signIn = async (email: string, password: string) => {
    if (!isConfigured) {
      return {
        success: false,
        error: 'Supabase credentials are missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables or configure them below.',
      };
    }

    const cleanEmail = email.trim().toLowerCase();

    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        await loadProfile(data.session.user.id, data.session.user.email || '');
      }

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Sign in failed' };
    }
  };

  const signOut = async () => {
    if (isConfigured && user) {
      try {
        const client = getSupabaseClient();
        await client.from('profiles').update({
          is_online: false,
          updated_at: new Date().toISOString(),
        }).eq('id', user.id);
        await client.auth.signOut();
      } catch (err) {
        console.warn('Sign out error:', err);
      }
    }
    setUser(null);
    setProfile(null);
    setSession(null);
    setRoleState('user');
  };

  const resetPassword = async (email: string) => {
    if (!isConfigured) {
      return { success: false, error: 'Supabase is not configured yet.' };
    }
    try {
      const client = getSupabaseClient();
      const { error } = await client.auth.resetPasswordForEmail(email);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Password reset failed' };
    }
  };

  const isAdmin = role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        role,
        isAdmin,
        loading,
        isConfigured,
        allProfiles,
        refreshProfiles: fetchAllProfiles,
        signUp,
        signIn,
        signOut,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
