'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, PanelLeftClose, PanelLeftOpen, X, Lock, Search } from 'lucide-react';
import { useAuth } from '@/presentation/context/AuthContext';
import { NAV_ITEMS } from '@/presentation/navigation';
import { SyncStatus } from './SyncStatus';

interface SidebarProps {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}


export function Sidebar({ isMobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { canManage } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('erp_sidebar_collapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
  }, []);

  const toggleSidebar = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    localStorage.setItem('erp_sidebar_collapsed', String(nextState));
  };

  const navContent = (isMobile: boolean = false) => (
    <>
      {/* Brand Header */}
      <div
        className={`p-4 border-b border-purple-900/40 flex items-center shrink-0 ${
          !isMobile && isCollapsed ? 'justify-center' : 'justify-between gap-3'
        }`}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#EAA824] to-[#F59E0B] flex items-center justify-center shadow-lg shadow-amber-500/20 font-black text-[#260B22] text-base tracking-wider shrink-0">
            PS
          </div>
          {(!isCollapsed || isMobile) && (
            <div className="overflow-hidden">
              <p className="font-bold text-white text-sm tracking-tight leading-none truncate">Pajarita Store</p>
              <span className="text-[11px] font-medium text-amber-300/90 mt-1 block truncate">Gestor de operaciones</span>
            </div>
          )}
        </div>

        {isMobile ? (
          <button
            onClick={onMobileClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        ) : !isCollapsed ? (
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            title="Contraer menú lateral"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={toggleSidebar}
            className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Expandir menú lateral"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto py-4 px-2.5 space-y-1.5 custom-scrollbar overflow-x-hidden">
        {/* Búsqueda global (Ctrl+K) */}
        <button
          type="button"
          onClick={() => {
            if (isMobile && onMobileClose) onMobileClose();
            window.dispatchEvent(new Event('ps:open-search'));
          }}
          className={`w-full mb-2 flex items-center rounded-xl text-sm text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors ${
            !isMobile && isCollapsed ? 'justify-center py-2.5' : 'gap-3 px-3.5 py-2'
          }`}
          title="Buscar (Ctrl+K)"
          aria-label="Buscar en todo el sistema"
        >
          <Search className="w-4 h-4 shrink-0" aria-hidden="true" />
          {(isMobile || !isCollapsed) && (
            <>
              <span className="flex-1 text-left">Buscar…</span>
              <kbd className="text-[10px] font-semibold bg-white/10 rounded px-1.5 py-0.5">Ctrl K</kbd>
            </>
          )}
        </button>

        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const isRestricted = !item.isPublic && !canManage;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                if (isMobile && onMobileClose) onMobileClose();
              }}
              className={`group relative flex items-center ${
                !isMobile && isCollapsed ? 'justify-center px-0 py-3' : 'justify-between px-3.5 py-2.5'
              } rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-gradient-to-r from-[#EAA824] to-[#F59E0B] text-[#260B22] font-black shadow-lg shadow-amber-950/40'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
              title={!isMobile && isCollapsed ? item.name : undefined}
            >
              <div className={`flex items-center ${!isMobile && isCollapsed ? 'justify-center' : 'gap-3 overflow-hidden'}`}>
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-[#260B22]' : 'text-white/70 group-hover:text-white'
                  }`}
                />
                {(isMobile || !isCollapsed) && (
                  <span className="truncate flex items-center gap-1.5">
                    {item.name}
                    {item.isPublic && !canManage && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1 rounded font-normal">
                        Público
                      </span>
                    )}
                  </span>
                )}
              </div>

              {(isMobile || !isCollapsed) && isRestricted && (
                <span title="Requiere autenticación">
                  <Lock className="w-3.5 h-3.5 text-white/40 shrink-0" />
                </span>
              )}

              {(isMobile || !isCollapsed) && isActive && (
                <ChevronRight className="w-3.5 h-3.5 text-[#260B22] shrink-0" />
              )}

              {/* Floating Tooltip en modo colapsado desktop */}
              {!isMobile && isCollapsed && (
                <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#260B22] text-white text-xs font-semibold rounded-lg shadow-2xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 border border-purple-800/60">
                  <span>{item.name}</span>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Estado real de sincronización con la nube */}
      <div
        className={`p-2 border-t border-purple-900/40 bg-purple-950/40 shrink-0 ${
          !isMobile && isCollapsed ? 'flex justify-center' : ''
        }`}
      >
        <SyncStatus compact={!isMobile && isCollapsed} />
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden md:flex shrink-0 bg-gradient-to-b from-[#260B22] via-[#3D1537] to-[#260B22] text-white flex-col h-full z-40 select-none shadow-2xl border-r border-purple-950/60 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {navContent(false)}
      </aside>

      {/* Mobile Drawer Backdrop & Menu */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-[#260B22]/70 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={onMobileClose}
          />
          <aside className="relative w-72 max-w-[80vw] bg-gradient-to-b from-[#260B22] via-[#3D1537] to-[#260B22] text-white flex flex-col h-full z-50 shadow-2xl border-r border-purple-950/60 animate-in slide-in-from-left duration-200">
            {navContent(true)}
          </aside>
        </div>
      )}
    </>
  );
}
