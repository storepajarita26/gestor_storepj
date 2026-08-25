'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingBag,
  PackageSearch,
  Warehouse,
  Boxes,
  Receipt,
  CreditCard,
  BarChart3,
  Settings,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeColor?: string;
}

const NAV_ITEMS: NavItem[] = [
  { name: 'Resumen Ejecutivo', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Compras & Tránsito', href: '/compras', icon: ShoppingBag, badge: 'Shein / Amz' },
  { name: 'Recepción & Aduana', href: '/recepciones', icon: PackageSearch },
  { name: 'Inventario & Kardex', href: '/inventario', icon: Warehouse },
  { name: 'Catálogo & SKUs', href: '/catalogo', icon: Boxes },
  { name: 'Ventas & Facturas', href: '/ventas', icon: Receipt },
  { name: 'Créditos & Abonos', href: '/creditos', icon: CreditCard, badgeColor: 'bg-sky-400/20 text-sky-200' },
  { name: 'Analítica & Rentabilidad', href: '/analitica', icon: BarChart3 },
  { name: 'Configuración Global', href: '/configuracion', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
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

  return (
    <aside
      className={`shrink-0 bg-gradient-to-b from-[#101E38] via-[#172E5E] to-[#101E38] text-white flex flex-col h-full z-40 select-none shadow-2xl border-r border-blue-900/40 transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className={`p-4 border-b border-blue-800/40 flex items-center shrink-0 ${isCollapsed ? 'justify-center' : 'justify-between gap-3'}`}>
        {!isCollapsed ? (
          <>
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#38BDF8] to-[#7DD3FC] flex items-center justify-center shadow-lg font-extrabold text-[#0F172A] text-base tracking-wider shrink-0">
                PS
              </div>
              <div className="overflow-hidden">
                <h1 className="font-semibold text-white text-xs tracking-tight leading-none truncate">
                  Gestor de Operaciones
                </h1>
                <span className="text-[10px] font-medium text-sky-300 mt-1 block truncate">Pajarita Store 2.0</span>
              </div>
            </div>
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              title="Contraer menú lateral"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={toggleSidebar}
              className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#38BDF8] to-[#7DD3FC] flex items-center justify-center shadow-lg font-extrabold text-[#0F172A] text-base tracking-wider hover:scale-105 transition-transform"
              title="Expandir menú lateral"
            >
              PS
            </button>
            <button
              onClick={toggleSidebar}
              className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              title="Expandir menú lateral"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto py-4 px-2.5 space-y-1.5 custom-scrollbar overflow-x-hidden">
        {!isCollapsed && (
          <div className="px-3 pb-2 text-[10px] font-bold text-sky-200/60 uppercase tracking-wider">
            Módulos Operativos
          </div>
        )}

        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center ${
                isCollapsed ? 'justify-center px-0 py-3' : 'justify-between px-3.5 py-2.5'
              } rounded-xl text-xs font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-gradient-to-r from-[#38BDF8] to-[#60A5FA] text-[#0F172A] font-extrabold shadow-lg shadow-sky-950/30'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
              title={isCollapsed ? item.name : undefined}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 overflow-hidden'}`}>
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-[#0F172A]' : 'text-white/70 group-hover:text-white'
                  }`}
                />
                {!isCollapsed && <span className="truncate">{item.name}</span>}
              </div>

              {!isCollapsed && item.badge && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-md font-semibold tracking-wide shrink-0 ${
                    isActive
                      ? 'bg-slate-900/20 text-[#0F172A]'
                      : item.badgeColor || 'bg-blue-900/80 text-white/90'
                  }`}
                >
                  {item.badge}
                </span>
              )}

              {!isCollapsed && isActive && !item.badge && (
                <ChevronRight className="w-3.5 h-3.5 text-[#0F172A] shrink-0" />
              )}

              {/* Floating Tooltip en modo colapsado */}
              {isCollapsed && (
                <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#0B1528] text-white text-xs font-semibold rounded-lg shadow-2xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 border border-blue-800/60">
                  <span>{item.name}</span>
                  {item.badge && (
                    <span className="ml-1.5 text-[9px] bg-sky-400 text-slate-950 px-1.5 py-0.5 rounded font-bold">
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Footer System Status */}
      <div className={`p-3 border-t border-blue-800/40 bg-blue-950/40 shrink-0 ${isCollapsed ? 'flex justify-center' : ''}`}>
        {!isCollapsed ? (
          <div className="flex items-center justify-between text-[11px] text-white/70">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
              <span>Sistema Operativo</span>
            </div>
            <span className="font-mono text-[10px] text-white/60">v2.0 Pro</span>
          </div>
        ) : (
          <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" title="Sistema Operativo v2.0 Pro" />
        )}
      </div>
    </aside>
  );
}
