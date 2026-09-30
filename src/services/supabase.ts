import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Configuration storage keys
const SUPABASE_URL_KEY = 'kgp_supabase_url';
const SUPABASE_ANON_KEY = 'kgp_supabase_anon_key';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isEnvConfigured: boolean;
}

/**
 * Sanitizes input URL or key by trimming whitespace and removing outer quotes or trailing slashes
 */
export function sanitizeCredential(val: string | null | undefined): string {
  if (!val) return '';
  let cleaned = val.trim();
  // Strip surrounding quotes if user copied them
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  // Strip trailing slash if present on URL
  if (cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

/**
 * Checks if a key is a valid non-placeholder Supabase key
 */
export function isValidSupabaseKey(key: string | null | undefined): boolean {
  if (!key) return false;
  const clean = sanitizeCredential(key);
  if (
    clean === '' ||
    clean.includes('your-anon-key') ||
    clean.includes('placeholder') ||
    clean.includes('YOUR_') ||
    clean.length < 20
  ) {
    return false;
  }
  return true;
}

/**
 * Checks if URL is a valid Supabase project URL
 */
export function isValidSupabaseUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const clean = sanitizeCredential(url);
  if (
    clean === '' ||
    clean.includes('placeholder') ||
    clean.includes('your-project-id') ||
    clean.includes('YOUR_')
  ) {
    return false;
  }
  return clean.startsWith('http://') || clean.startsWith('https://');
}

/**
 * Get active Supabase configuration:
 * 1. Checks environment variables (VITE_SUPABASE_URL or other aliases)
 * 2. Fallbacks to localStorage config entered via in-app Settings or AuthModal
 */
export function getSupabaseConfig(): SupabaseConfig {
  const envUrl = sanitizeCredential(import.meta.env.VITE_SUPABASE_URL as string);
  const envKey = sanitizeCredential(import.meta.env.VITE_SUPABASE_ANON_KEY as string);

  if (isValidSupabaseUrl(envUrl) && isValidSupabaseKey(envKey)) {
    return {
      url: envUrl,
      anonKey: envKey,
      isEnvConfigured: true,
    };
  }

  const storedUrl = typeof window !== 'undefined' ? sanitizeCredential(localStorage.getItem(SUPABASE_URL_KEY)) : '';
  const storedKey = typeof window !== 'undefined' ? sanitizeCredential(localStorage.getItem(SUPABASE_ANON_KEY)) : '';

  return {
    url: storedUrl,
    anonKey: storedKey,
    isEnvConfigured: false,
  };
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  if (typeof window !== 'undefined') {
    const cleanUrl = sanitizeCredential(url);
    const cleanKey = sanitizeCredential(anonKey);
    localStorage.setItem(SUPABASE_URL_KEY, cleanUrl);
    localStorage.setItem(SUPABASE_ANON_KEY, cleanKey);
    resetSupabaseClient();
  }
}

export function clearSupabaseConfig(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SUPABASE_URL_KEY);
    localStorage.removeItem(SUPABASE_ANON_KEY);
    resetSupabaseClient();
  }
}

export function isSupabaseConfigured(): boolean {
  const config = getSupabaseConfig();
  return isValidSupabaseUrl(config.url) && isValidSupabaseKey(config.anonKey);
}

// Fallback dummy credentials when not yet connected
const fallbackUrl = 'https://placeholder.supabase.co';
const fallbackKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy';

let currentClient: SupabaseClient | null = null;
let activeUrl = '';
let activeKey = '';

export function resetSupabaseClient(): void {
  currentClient = null;
  activeUrl = '';
  activeKey = '';
}

export function getSupabaseClient(): SupabaseClient {
  const config = getSupabaseConfig();
  const targetUrl = config.url && isValidSupabaseUrl(config.url) ? config.url : fallbackUrl;
  const targetKey = config.anonKey && isValidSupabaseKey(config.anonKey) ? config.anonKey : fallbackKey;

  // Re-create client if credentials changed or if not yet initialized
  if (!currentClient || activeUrl !== targetUrl || activeKey !== targetKey) {
    activeUrl = targetUrl;
    activeKey = targetKey;
    currentClient = createClient(targetUrl, targetKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return currentClient;
}

export const supabase = getSupabaseClient();

/**
 * Test connectivity with Supabase project
 */
export async function testSupabaseConnection(
  url?: string,
  anonKey?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const cleanUrl = sanitizeCredential(url || getSupabaseConfig().url);
    const cleanKey = sanitizeCredential(anonKey || getSupabaseConfig().anonKey);

    if (!cleanUrl || !cleanKey) {
      return { success: false, message: 'Both Supabase Project URL and Anon Key are required.' };
    }

    if (!isValidSupabaseUrl(cleanUrl)) {
      return {
        success: false,
        message: 'Invalid Project URL. It should look like: https://xxxxxxxxxxxx.supabase.co',
      };
    }

    if (!isValidSupabaseKey(cleanKey)) {
      return {
        success: false,
        message: 'Invalid API Key format. Make sure you copied the "anon" "public" key (starts with eyJ...).',
      };
    }

    const testClient = createClient(cleanUrl, cleanKey);
    const { error } = await testClient.from('profiles').select('id').limit(1);

    if (error) {
      if (error.message.includes('Invalid API key') || error.message.includes('JWT')) {
        return {
          success: false,
          message: 'Supabase rejected this API key ("Invalid API key"). Go to Supabase -> Project Settings -> API and copy the "anon" "public" key.',
        };
      }
      if (error.message.includes('relation "public.profiles" does not exist')) {
        return {
          success: true,
          message: 'Connected to Supabase! Tables need to be created. Please run the SQL schema in your Supabase SQL editor.',
        };
      }
      if (error.code === 'PGRST116' || error.code === '42501') {
        return { success: true, message: 'Successfully connected and verified Supabase API key!' };
      }
      return { success: false, message: error.message };
    }

    return { success: true, message: 'Successfully connected to Supabase and verified tables!' };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown connection error';
    return { success: false, message: errorMsg };
  }
}
