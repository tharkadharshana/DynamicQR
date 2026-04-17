import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || supabaseUrl === '') {
  console.error(
    'CRITICAL: VITE_SUPABASE_URL is missing. ' +
    'Please set it in your .env file or Vercel environment variables.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});

/**
 * Sign in with Google using Supabase OAuth.
 * After login, Supabase automatically stores the session.
 */
export const loginWithGoogle = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/',
    }
  });
  if (error) {
    console.error('Google login error:', error.message);
    throw error;
  }
};

/**
 * Sign out the current user.
 */
export const logout = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Logout error:', error.message);
  }
};

/**
 * Get the currently authenticated user (null if not logged in).
 */
export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};
