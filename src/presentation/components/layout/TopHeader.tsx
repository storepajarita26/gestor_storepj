'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DollarSign, Menu, LogIn, LogOut, Search } from 'lucide-react';
import { findNavItem } from '@/presentation/navigation';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { useAuth } from '@/presentation/context/AuthContext';

interface TopHeaderProps {
  title?: string;
  subtitle?: string;
  onToggleMobileMenu?: () => void;
}

export function TopHeader({ title, subtitle, onToggleMobileMenu }: TopHeaderProps) {
  const { user, signOut, canManage } = useAuth();
  const pathname = usePathname();
  const page = findNavItem(pathname || '');
  const pageTitle = title || page?.name || 'Pajarita Store';
  const pageSubtitle = subtitle || page?.description;
  const [exchangeRate, setExchangeRate] = useState<number>(36.80);
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [tempRate, setTempRate] = useState('36.80');

  useEffect(() => {
    setExchangeRate(dataStore.getExchangeRate());
    setTempRate(dataStore.getExchangeRate().toString());
    const unsub = dataStore.subscribe(() => {
      const r = dataStore.getExchangeRate();
      setExchangeRate(r);
      setTempRate(r.toString());
    });
    return unsub;
  }, []);

  const handleSaveRate = () => {
    const parsed = parseFloat(tempRate);
    if (!isNaN(parsed) && parsed > 0) {
      dataStore.setExchangeRate(parsed);
      setIsEditingRate(false);
    }
  };

  return (
    <header className="h-16 border-b border-moss/10 bg-white/70 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm shrink-0">
      {/* Mobile Hamburger & Title / Module info */}
      <div className="flex items-center gap-3">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 -ml-1 rounded-xl text-ink hover:bg-moss/10 transition-colors"
            title="Abrir menú de navegación"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5 text-moss" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-ink tracking-tight leading-tight truncate">{pageTitle}</h1>
          {pageSubtitle && <p className="text-xs text-ink-muted leading-snug hidden lg:block truncate">{pageSubtitle}</p>}
        </div>
      </div>

      {/* Action and Tools bar */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Búsqueda global */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('ps:open-search'))}
          className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border border-moss/15 bg-surface hover:bg-white text-sm text-ink-muted shadow-sm"
          aria-label="Buscar (Ctrl+K)"
          title="Buscar productos, facturas, clientes u órdenes (Ctrl+K)"
        >
          <Search className="w-4 h-4 text-moss" aria-hidden="true" />
          <span className="hidden md:inline">Buscar</span>
          <kbd className="hidden md:inline text-[10px] font-semibold bg-white border border-moss/15 rounded px-1.5 py-0.5">Ctrl K</kbd>
        </button>

        {/* Exchange Rate Badge */}
        <div className="hidden sm:flex items-center gap-2 bg-surface border border-moss/15 px-3 py-1.5 rounded-xl text-xs shadow-sm">
          <DollarSign className="w-3.5 h-3.5 text-moss" />
          <span className="text-ink-muted font-medium">Tasa USD/NIO:</span>
          {!canManage ? (
            // Sin sesión la tasa solo se muestra; no se puede editar
            <span className="font-bold text-moss">C$ {exchangeRate.toFixed(2)}</span>
          ) : isEditingRate ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.01"
                value={tempRate}
                onChange={(e) => setTempRate(e.target.value)}
                className="w-16 bg-white border border-moss rounded px-1.5 py-0.5 text-xs text-ink focus:outline-none"
                autoFocus
              />
              <button
                onClick={handleSaveRate}
                className="bg-moss hover:bg-moss-700 text-white text-[10px] px-2 py-0.5 rounded font-semibold transition-colors"
              >
                OK
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingRate(true)}
              className="font-bold text-moss hover:underline flex items-center gap-1"
              title="Click para cambiar tasa oficial"
            >
              C$ {exchangeRate.toFixed(2)}
              <span className="text-[10px] text-ink-muted font-normal">(editar)</span>
            </button>
          )}
        </div>

        {/* User Session & Auth Action */}
        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-[11px] font-bold text-ink leading-tight truncate max-w-[140px]">
                  {user.email}
                </span>
                <span className="text-[9px] text-emerald-600 font-medium">Administrador</span>
              </div>
              <button
                onClick={() => signOut()}
                className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-xl border border-rose-200 transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline font-semibold">Salir</span>
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 text-xs bg-moss hover:bg-moss-700 text-white font-bold px-3 py-1.5 rounded-xl transition-all shadow-sm"
              title="Iniciar sesión en el ERP"
            >
              <LogIn className="w-3.5 h-3.5 text-mustard" />
              <span>Acceder</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

