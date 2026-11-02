'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/infrastructure/supabase/client';
import { dataStore } from '@/infrastructure/repositories/dataStore';

/**
 * Sin Supabase configurado solo se permite operar el ERP en desarrollo local.
 * En producción, una instalación sin Supabase NO debe quedar abierta (S4).
 */
const LOCAL_MODE_ALLOWED = process.env.NODE_ENV !== 'production';

// Último usuario para el que se recargaron los datos privados
let lastSyncedUserId: string | null = null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isConfigured: boolean;
  /** true si el usuario puede usar funciones administrativas (sesión iniciada, o modo local en desarrollo) */
  canManage: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  isConfigured: false,
  canManage: false,
  signInWithPassword: async () => ({ error: null }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      // Si Supabase no está configurado (modo local sin .env), se desactiva loading
      setIsLoading(false);
      return;
    }

    // 1. Obtener la sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      lastSyncedUserId = session?.user?.id ?? null; // la carga inicial ya sincroniza con esta sesión
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    }).catch(() => {
      setIsLoading(false);
    });

    // 2. Suscribirse a cambios de estado de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);

      // Al iniciar sesión, recargar los datos privados del ERP (ventas, compras, clientes, kardex)
      // que no son visibles sin sesión por las políticas RLS.
      // (Supabase también emite SIGNED_IN al volver a la pestaña: solo se sincroniza si cambió el usuario)
      const userId = session?.user?.id ?? null;
      if (event === 'SIGNED_IN' && userId && userId !== lastSyncedUserId) {
        lastSyncedUserId = userId;
        // Diferido para no llamar a Supabase dentro del callback de auth (evita bloqueos del cliente)
        setTimeout(() => {
          dataStore.syncFromSupabase();
        }, 0);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = async (email: string, password: string) => {
    if (!isSupabaseConfigured || !supabase) {
      return {
        error: new Error('Supabase no está conectado. Revisa las variables en .env.local.'),
      };
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } catch (err: any) {
      return { error: err };
    }
  };

  const signOut = async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.error('Error al cerrar sesión:', err);
      }
    }
    setUser(null);
    setSession(null);
    lastSyncedUserId = null;
  };

  const value = useMemo(
    () => ({
      user,
      session,
      isLoading,
      isConfigured: isSupabaseConfigured,
      canManage: isSupabaseConfigured ? Boolean(user) : LOCAL_MODE_ALLOWED,
      signInWithPassword,
      signOut,
    }),
    [user, session, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
}
