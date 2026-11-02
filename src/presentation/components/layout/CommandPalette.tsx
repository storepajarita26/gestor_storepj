'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Search, Receipt, UserRound, Shirt, ShoppingBag, CornerDownLeft, ArrowRight } from 'lucide-react';
import { dataStore, WALK_IN_CUSTOMER_ID } from '@/infrastructure/repositories/dataStore';
import { customerMatches, normalizeSearch } from '@/domain/sales/services/customerService';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { useAuth } from '@/presentation/context/AuthContext';
import { DEEP_LINK_EVENT, NAV_ITEMS } from '@/presentation/navigation';

interface ResultItem {
  id: string;
  group: 'Ir a' | 'Prendas' | 'Facturas' | 'Clientes' | 'Compras';
  title: string;
  subtitle?: string;
  meta?: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}

const LIMIT = 5;

function words(query: string) {
  return normalizeSearch(query.trim()).split(/\s+/).filter(Boolean);
}

function matchesAll(haystack: string, ws: string[]) {
  const h = normalizeSearch(haystack);
  return ws.every((w) => h.includes(w));
}

/**
 * Búsqueda global (Ctrl+K o "/"): prendas, facturas, clientes, órdenes de compra y pantallas.
 * Enter abre el resultado; las flechas cambian de opción.
 */
export function CommandPalette() {
  const router = useRouter();
  const { canManage } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const openPalette = () => {
      previousFocus.current = document.activeElement as HTMLElement | null;
      setOpen(true);
      setQuery('');
      setHighlight(0);
    };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openPalette();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        openPalette();
      } else if (e.altKey && e.key.toLowerCase() === 'v' && canManage) {
        // Atajo directo al punto de venta
        e.preventDefault();
        router.push('/vender');
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('ps:open-search', openPalette);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('ps:open-search', openPalette);
    };
  }, [canManage, router]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => setHighlight(0), [query]);

  const results: ResultItem[] = useMemo(() => {
    if (!open) return [];
    const ws = words(query);
    const pages: ResultItem[] = NAV_ITEMS.filter((n) => canManage || n.isPublic)
      .filter((n) => ws.length === 0 || matchesAll(`${n.name} ${n.description}`, ws))
      .map((n) => ({ id: `nav-${n.href}`, group: 'Ir a', title: n.name, subtitle: n.description, icon: n.icon, href: n.href }));
    if (ws.length === 0) return pages;

    const out: ResultItem[] = [];

    // Prendas (variantes)
    const skuResults: ResultItem[] = [];
    for (const product of dataStore.getProducts()) {
      for (const sku of product.skus || []) {
        const text = `${sku.skuCode} ${product.productCode || ''} ${product.name} ${sku.skuDescription || ''} ${sku.size || ''} ${sku.colorName || ''}`;
        if (!matchesAll(text, ws)) continue;
        skuResults.push({
          id: `sku-${sku.id}`,
          group: 'Prendas',
          title: sku.skuDescription || product.name,
          subtitle: [sku.skuCode, sku.size, sku.colorName].filter(Boolean).join(' · '),
          meta: canManage ? `${dataStore.getAvailableToSell(sku.id)} disp.` : formatNIO(sku.promoPriceNio || sku.salePriceNio),
          icon: Shirt,
          href: canManage ? `/inventario?q=${encodeURIComponent(sku.skuCode)}` : `/catalogo?q=${encodeURIComponent(sku.skuCode)}`,
        });
        if (skuResults.length >= LIMIT) break;
      }
      if (skuResults.length >= LIMIT) break;
    }
    out.push(...skuResults);

    if (canManage) {
      // Facturas: número, cliente o guía
      out.push(
        ...dataStore
          .getInvoices()
          .filter((inv) => matchesAll(`${inv.invoiceNumber} ${inv.customerName || ''} ${inv.trackingRef || ''}`, ws))
          .slice(0, LIMIT)
          .map((inv) => ({
            id: `inv-${inv.id}`,
            group: 'Facturas' as const,
            title: `${inv.invoiceNumber} · ${inv.customerName || ''}`,
            subtitle: `${inv.issueDate}${inv.status === 'anulada' ? ' · anulada' : inv.balanceDueNio > 0 ? ` · saldo ${formatNIO(inv.balanceDueNio)}` : ''}`,
            meta: formatNIO(inv.totalNio),
            icon: Receipt,
            href: `/ventas?factura=${inv.id}`,
          }))
      );

      // Clientes
      const q = query.trim();
      out.push(
        ...dataStore
          .getCustomers()
          .filter((c) => c.id !== WALK_IN_CUSTOMER_ID && customerMatches(c, q))
          .slice(0, LIMIT)
          .map((c) => ({
            id: `cust-${c.id}`,
            group: 'Clientes' as const,
            title: c.fullName,
            subtitle: [c.phoneWhatsapp, c.city].filter(Boolean).join(' · '),
            icon: UserRound,
            href: `/clientes?id=${c.id}`,
          }))
      );

      // Órdenes de compra: número, proveedor, pedido del proveedor o rastreo
      out.push(
        ...dataStore
          .getPurchaseOrders()
          .filter((o) => matchesAll(`${o.orderNumber} ${o.supplierName} ${o.supplierOrderId || ''} ${o.trackingNumber || ''}`, ws))
          .slice(0, LIMIT)
          .map((o) => ({
            id: `po-${o.id}`,
            group: 'Compras' as const,
            title: `${o.orderNumber} · ${o.supplierName}`,
            subtitle: [o.trackingNumber, o.datePurchased].filter(Boolean).join(' · '),
            meta: o.status.replace(/_/g, ' '),
            icon: ShoppingBag,
            href: `/compras?q=${encodeURIComponent(o.orderNumber)}`,
          }))
      );
    }

    return [...out, ...pages.slice(0, 3)];
  }, [open, query, canManage]);

  const close = () => {
    setOpen(false);
    setTimeout(() => previousFocus.current?.focus?.(), 0);
  };

  const go = (item: ResultItem) => {
    setOpen(false);
    router.push(item.href);
    // Si ya estaba en esa pantalla, avisarle que lea el nuevo parámetro
    setTimeout(() => window.dispatchEvent(new Event(DEEP_LINK_EVENT)), 150);
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  if (!open || typeof document === 'undefined') return null;

  let lastGroup = '';
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[10vh]" role="dialog" aria-modal="true" aria-label="Búsqueda global">
      <div className="fixed inset-0 bg-moss-950/40 backdrop-blur-xs" onClick={close} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-moss/20 overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-moss/10">
          <Search className="w-5 h-5 text-moss shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (results[highlight]) go(results[highlight]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results[highlight] ? `palette-${results[highlight].id}` : undefined}
            placeholder={canManage ? 'Buscar prenda, factura, cliente u orden…' : 'Buscar prenda…'}
            className="flex-1 py-4 text-base text-ink bg-transparent focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="text-[11px] font-semibold text-ink-muted border border-moss/15 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <ul id="palette-results" ref={listRef} role="listbox" className="max-h-[60vh] overflow-y-auto py-2">
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-muted">Sin resultados para «{query.trim()}».</li>
          )}
          {results.map((item, idx) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            const active = idx === highlight;
            return (
              <React.Fragment key={item.id}>
                {header && (
                  <li role="presentation" className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                    {header}
                  </li>
                )}
                <li
                  id={`palette-${item.id}`}
                  data-index={idx}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => go(item)}
                  className={`mx-2 px-3 py-2 rounded-xl flex items-center gap-3 cursor-pointer ${active ? 'bg-moss/10' : ''}`}
                >
                  <Icon className="w-4 h-4 text-moss shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink truncate">{item.title}</span>
                    {item.subtitle && <span className="block text-xs text-ink-muted truncate">{item.subtitle}</span>}
                  </span>
                  {item.meta && <span className="text-xs text-ink-muted shrink-0 tabular-nums">{item.meta}</span>}
                  {active ? (
                    <CornerDownLeft className="w-4 h-4 text-ink-muted shrink-0" aria-hidden="true" />
                  ) : (
                    <ArrowRight className="w-4 h-4 text-transparent shrink-0" aria-hidden="true" />
                  )}
                </li>
              </React.Fragment>
            );
          })}
        </ul>

        <div className="px-4 py-2 border-t border-moss/10 text-[11px] text-ink-muted flex gap-4 bg-surface/60">
          <span><kbd className="font-semibold">↑↓</kbd> elegir</span>
          <span><kbd className="font-semibold">Enter</kbd> abrir</span>
          <span><kbd className="font-semibold">Ctrl K</kbd> o <kbd className="font-semibold">/</kbd> buscar</span>
          {canManage && <span><kbd className="font-semibold">Alt V</kbd> vender</span>}
        </div>
      </div>
    </div>,
    document.body
  );
}
