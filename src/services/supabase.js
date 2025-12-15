import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Only import polyfill on native platforms
if (Platform.OS !== 'web') {
  require('react-native-url-polyfill/auto');
}

const SUPABASE_URL = 'https://wqrbcfanfasbceiqmubq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcmJjZmFuZmFzYmNlaXFtdWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NDY0MDMsImV4cCI6MjA4MDQyMjQwM30.DTBb_4NJSTNkFLysLDSvMVL90FaJFQG3f3v1ULPAjlk';

export const ADMIN_EMAILS = ['lca.valenti@gmail.com'];

// Create storage adapter that works on both web and native
const storageAdapter = Platform.OS === 'web' 
  ? {
      getItem: (key) => {
        console.log('[Supabase Storage] getItem:', key);
        return Promise.resolve(window.localStorage.getItem(key));
      },
      setItem: (key, value) => {
        console.log('[Supabase Storage] setItem:', key);
        window.localStorage.setItem(key, value);
        return Promise.resolve();
      },
      removeItem: (key) => {
        console.log('[Supabase Storage] removeItem:', key);
        window.localStorage.removeItem(key);
        return Promise.resolve();
      },
    }
  : AsyncStorage;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: storageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
