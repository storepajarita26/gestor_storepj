'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { CommandPalette } from './CommandPalette';
import { ToastProvider } from '@/presentation/components/ui/Toast';
import { useAuth } from '@/presentation/context/AuthContext';
import { Lock, LogIn, ShoppingBag } from 'lucide-react';
import Link from 'next/link';

// Rutas accesibles de forma pública. El catálogo se muestra en modo solo lectura y sin costos
// cuando no hay sesión. Inventario & Kardex expone costos y acciones, por eso es privado.
const PUBLIC_ROUTES = ['/catalogo', '/login'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading, isConfigured, canManage } = useAuth();

  // Si estamos en la página de login, renderizarla a pantalla completa sin el shell del ERP
  if (pathname === '/login') {
    return <ToastProvider>{children}</ToastProvider>;
  }

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
  const requiresAuth = !isPublicRoute;

  // Bloquear si la ruta requiere autenticación y el usuario no puede administrar
  // (sin sesión, o una instalación de producción sin Supabase configurado)
  const isUnauthorized = !isLoading && requiresAuth && !canManage;
  const isMissingConfig = !isConfigured;

  return (
    <ToastProvider>
      <div className="erp-app h-full flex overflow-hidden text-ink antialiased selection:bg-mustard selection:text-moss-900">
        {/* Barra Lateral: Desktop & Mobile Drawer */}
        <Sidebar
          isMobileOpen={isMobileNavOpen}
          onMobileClose={() => setIsMobileNavOpen(false)}
        />

        {/* Área de Trabajo y Contenido Principal con Scroll Independiente */}
        <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
          <TopHeader onToggleMobileMenu={() => setIsMobileNavOpen((prev) => !prev)} />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
            {isUnauthorized ? (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-6">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mb-4 shadow-sm">
                  <Lock className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-ink mb-2">
                  {isMissingConfig ? 'Configuración de Supabase pendiente' : 'Acceso Restringido a Administradores'}
                </h3>
                <p className="text-xs sm:text-sm text-ink-muted max-w-md mb-6 leading-relaxed">
                  {isMissingConfig
                    ? 'Esta instalación no tiene conexión a Supabase configurada (NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY). Por seguridad, los módulos administrativos están bloqueados.'
                    : 'Este módulo requiere inicio de sesión para realizar operaciones de compra, venta, recepciones o ajustes de caja.'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {!isMissingConfig && (
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 bg-moss hover:bg-moss-700 text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow-md shadow-moss/20 transition-all"
                  >
                    <LogIn className="w-4 h-4 text-mustard" />
                    <span>Iniciar Sesión</span>
                  </Link>
                  )}
                  <Link
                    href="/catalogo"
                    className="inline-flex items-center gap-2 bg-white hover:bg-surface border border-moss/20 text-ink font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-xl transition-all shadow-xs"
                  >
                    <ShoppingBag className="w-4 h-4 text-moss" />
                    <span>Consultar Catálogo</span>
                  </Link>
                </div>
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
      <CommandPalette />
    </ToastProvider>
  );
}

