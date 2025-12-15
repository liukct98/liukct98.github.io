import React, { createContext, useState, useContext, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { supabase, ADMIN_EMAILS } from '../services/supabase';
import Storage from '../services/storage';
import SupabaseStorage from '../services/supabaseStorage';
import colors from '../utils/colors';

// Storage adapter per salvare token
const storageAdapter = Platform.OS === 'web' 
  ? {
      setItem: (key, value) => {
        window.localStorage.setItem(key, value);
        return Promise.resolve();
      },
      getItem: (key) => Promise.resolve(window.localStorage.getItem(key)),
      removeItem: (key) => {
        window.localStorage.removeItem(key);
        return Promise.resolve();
      },
    }
  : require('@react-native-async-storage/async-storage').default;

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('AuthProvider mounted, checking user...');
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      console.log('Checking user session...');
      // Verifica se c'è una sessione attiva in Supabase
      const { data: { session }, error } = await Promise.race([
        supabase.auth.getSession(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Session check timeout')), 5000))
      ]);
      
      if (error) {
        console.error('Session error:', error);
        throw error;
      }
      
      console.log('Session:', session ? 'Found' : 'Not found');
      
      if (session?.user) {
        // Carica username dal profilo
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', session.user.id)
          .single();

        const userData = {
          id: session.user.id,
          email: session.user.email,
          username: profile?.username || session.user.email.split('@')[0],
          isAdmin: ADMIN_EMAILS.includes(session.user.email),
        };

        await Storage.setCurrentUser(userData);
        setUser(userData);
      } else {
        // Se non c'è sessione Supabase, controlla localStorage
        const storedUser = await Storage.getCurrentUser();
        if (storedUser) {
          // Se c'è un utente in storage ma non sessione, fai logout
          await Storage.removeCurrentUser();
          setUser(null);
        }
      }
    } catch (error) {
      console.error('Error checking user:', error);
    } finally {
      console.log('Setting loading to false');
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      console.log('Login: Starting...');
      
      // Usa fetch direttamente come workaround
      const response = await fetch(`${supabase.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabase.supabaseKey,
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const authData = await response.json();
      console.log('Login: Auth response', authData);

      if (!response.ok || authData.error) {
        throw new Error(authData.error_description || authData.error || 'Login failed');
      }

      // Salva il token manualmente
      if (authData.access_token) {
        await storageAdapter.setItem(
          'sb-wqrbcfanfasbceiqmubq-auth-token',
          JSON.stringify({
            access_token: authData.access_token,
            refresh_token: authData.refresh_token,
            expires_in: authData.expires_in,
            token_type: authData.token_type,
            user: authData.user,
          })
        );
      }

      const userData = {
        id: authData.user.id,
        email: authData.user.email,
        username: email.split('@')[0],
        isAdmin: ADMIN_EMAILS.includes(authData.user.email),
      };

      await Storage.setCurrentUser(userData);
      
      // Forza il client Supabase a ricaricare la sessione
      console.log('Login: Reloading Supabase session...');
      await supabase.auth.setSession({
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
      });
      
      setUser(userData);

      console.log('Login: Loading data from Supabase...');
      // Carica i dati dal cloud
      try {
        await SupabaseStorage.fullSync();
        console.log('Login: Data synced!');
      } catch (syncError) {
        console.error('Login: Sync error (non-fatal):', syncError);
      }

      console.log('Login: Complete!');
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  };

  const register = async (email, password, username) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      // Crea il profilo con lo username
      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            username: username,
          });

        if (profileError) {
          console.error('Error creating profile:', profileError);
        }
      }

      return { success: true, message: 'Registrazione completata! Verifica la tua email.' };
    } catch (error) {
      console.error('Register error:', error);
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      if (Platform.OS === 'web') {
        // Rimuovi manualmente i token Supabase dal localStorage
        Object.keys(window.localStorage)
          .filter((k) => k.includes('sb-wqrbcfanfasbceiqmubq'))
          .forEach((k) => window.localStorage.removeItem(k));
      } else {
        await supabase.auth.signOut();
      }
      await Storage.removeCurrentUser();
      setUser(null);
      if (Platform.OS === 'web') {
        window.location.reload();
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});

export const useAuth = () => useContext(AuthContext);
