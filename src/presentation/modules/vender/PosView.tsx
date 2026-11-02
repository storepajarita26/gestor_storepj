'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Minus, Plus, X, ShoppingCart, ScanBarcode, Keyboard, Trash2 } from 'lucide-react';
import { dataStore, WALK_IN_CUSTOMER_ID } from '@/infrastructure/repositories/dataStore';
import { Customer, SalesInvoice } from '@/domain/sales/types';
import { CartLine, CheckoutInput, buildSaleInvoice, cartSavings, cartTotal } from '@/domain/sales/services/saleBuilder';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { useToast } from '@/presentation/components/ui/Toast';
import { useDeepLink } from '@/presentation/hooks/useDeepLink';
import { ConfirmDialog } from '@/presentation/components/ui/ConfirmDialog';
import { SellableSku, findByCode, getSellableSkus, searchSkus } from './sellableSkus';
import { CustomerPicker } from './components/CustomerPicker';
import { CheckoutModal } from './components/CheckoutModal';
import { SaleDoneModal } from './components/SaleDoneModal';

const DRAFT_KEY = 'ps_pos_draft';

interface Draft {
  lines: CartLine[];
  customerId: string;
}

function loadDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.lines) ? parsed : null;
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft | null) {
  try {
    if (!draft || draft.lines.length === 0) window.localStorage.removeItem(DRAFT_KEY);
    else window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* sin almacenamiento: el carrito vive solo en memoria */
  }
}

/**
 * Punto de venta: buscador siempre listo (teclado o lector de código de barras),
 * carrito a la izquierda y total + "Cobrar" a la derecha.
 *   F2 buscar · F4 cliente · F9 cobrar · Esc limpiar búsqueda
 */
export function PosView() {
  const toast = useToast();
  const [skus, setSkus] = useState<SellableSku[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState(WALK_IN_CUSTOMER_ID);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [feedback, setFeedback] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [flashSku, setFlashSku] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [doneInvoiceId, setDoneInvoiceId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    setSkus(getSellableSkus());
    setCustomers(dataStore.getCustomers());
    setInvoices(dataStore.getInvoices());
  }, []);

  useEffect(() => {
    dataStore.getWalkInCustomer();
    refresh();
    const draft = loadDraft();
    if (draft) {
      setLines(draft.lines);
      if (draft.customerId) setCustomerId(draft.customerId);
    }
    setHydrated(true);
    setTimeout(() => searchRef.current?.focus(), 0);
    return dataStore.subscribe(refresh);
  }, [refresh]);

  // Desde la ficha del cliente: /vender?cliente=<id>
  useDeepLink('cliente', (id) => setCustomerId(id), hydrated);

  // El carrito sobrevive a un cambio de pantalla o recarga accidental
  useEffect(() => {
    if (hydrated) saveDraft({ lines, customerId });
  }, [lines, customerId, hydrated]);

  const customer: Customer =
    customers.find((c) => c.id === customerId) ||
    customers.find((c) => c.id === WALK_IN_CUSTOMER_ID) || {
      id: WALK_IN_CUSTOMER_ID,
      fullName: 'Cliente Invitado (Consumidor Final)',
      city: 'Managua',
    };
  const results = useMemo(() => searchSkus(skus, query), [skus, query]);
  const total = cartTotal(lines);
  const savings = cartSavings(lines);
  const units = lines.reduce((acc, l) => acc + l.quantity, 0);
  const doneInvoice = invoices.find((i) => i.id === doneInvoiceId) || null;
  const anyModalOpen = checkoutOpen || Boolean(doneInvoiceId) || confirmClear;

  useEffect(() => setHighlight(0), [query]);

  const showFeedback = (text: string, tone: 'ok' | 'error') => {
    setFeedback({ text, tone });
    setTimeout(() => setFeedback((f) => (f?.text === text ? null : f)), 2500);
  };

  const addSku = (sku: SellableSku) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.skuId === sku.skuId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        // La línea que se acaba de tocar sube arriba
        const [line] = next.splice(idx, 1);
        return [line, ...next];
      }
      return [
        {
          skuId: sku.skuId,
          skuCode: sku.skuCode,
          productName: sku.productName,
          size: sku.size,
          colorName: sku.colorName,
          mainImageUrl: sku.mainImageUrl,
          quantity: 1,
          regularPrice: sku.regularPrice,
          unitPrice: sku.price,
          unitCostNio: sku.costNio,
        },
        ...prev,
      ];
    });
    setQuery('');
    setFlashSku(sku.skuId);
    setTimeout(() => setFlashSku((f) => (f === sku.skuId ? null : f)), 600);
    const inCart = (lines.find((l) => l.skuId === sku.skuId)?.quantity || 0) + 1;
    if (inCart > sku.available) {
      showFeedback(`${sku.skuCode}: solo hay ${sku.available} disponible(s). Podrá venderse como pedido.`, 'error');
    } else {
      showFeedback(`Agregado: ${sku.description}`, 'ok');
    }
    searchRef.current?.focus();
  };

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!query.trim()) {
        // Enter con la búsqueda vacía repite la última prenda (escanear dos veces lo mismo)
        if (lines.length > 0) {
          const sku = skus.find((s) => s.skuId === lines[0].skuId);
          if (sku) addSku(sku);
        }
        return;
      }
      const exact = findByCode(skus, query);
      if (exact) return addSku(exact);
      if (results[highlight]) return addSku(results[highlight]);
      showFeedback(`No se encontró «${query.trim()}»`, 'error');
      setQuery('');
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      e.stopPropagation();
      setQuery('');
    }
  };

  const updateLine = (skuId: string, patch: Partial<CartLine>) => {
    setLines((prev) => prev.map((l) => (l.skuId === skuId ? { ...l, ...patch } : l)));
  };

  const removeLine = (skuId: string) => {
    setLines((prev) => prev.filter((l) => l.skuId !== skuId));
    searchRef.current?.focus();
  };

  const openCheckout = () => {
    if (lines.length === 0) {
      showFeedback('Agregue al menos una prenda para cobrar.', 'error');
      searchRef.current?.focus();
      return;
    }
    if (lines.some((l) => l.quantity <= 0 || l.unitPrice < 0)) {
      showFeedback('Revise cantidades y precios.', 'error');
      return;
    }
    setCheckoutOpen(true);
  };

  // Atajos de teclado de la pantalla
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        if (!anyModalOpen) searchRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (!anyModalOpen) customerRef.current?.focus();
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (!anyModalOpen) openCheckout();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const handleConfirm = async (input: CheckoutInput): Promise<string | null> => {
    try {
      const draft = buildSaleInvoice(lines, input);
      const res = await dataStore.addInvoice(draft);
      if (!res.data) return res.message;
      setCheckoutOpen(false);
      setLines([]);
      setCustomerId(WALK_IN_CUSTOMER_ID);
      setDoneInvoiceId(res.data.id);
      if (!res.success) toast.error(res.message, 'Venta guardada con observaciones');
      else if (res.sync === 'pending') toast.warning(res.message, 'Venta guardada en este equipo');
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'No se pudo registrar la venta.';
    }
  };

  const startNewSale = () => {
    setDoneInvoiceId(null);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  return (
    <div className="max-w-7xl mx-auto grid lg:grid-cols-[minmax(0,1fr)_360px] gap-5 pb-24 lg:pb-0">
      {/* Izquierda: buscador + carrito */}
      <section aria-label="Prendas de la venta" className="space-y-4 min-w-0">
        <div className="relative">
          <label htmlFor="pos-search" className="sr-only">Buscar o escanear prenda</label>
          <ScanBarcode className="w-5 h-5 text-moss absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            id="pos-search"
            ref={searchRef}
            type="text"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="pos-results"
            aria-activedescendant={results[highlight] ? `pos-r-${results[highlight].skuId}` : undefined}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKey}
            placeholder="Escanee el código o escriba nombre, talla o color…"
            className="w-full bg-white border-2 border-moss/30 rounded-2xl pl-11 pr-16 py-3.5 text-base text-ink shadow-sm focus:outline-none focus:border-moss focus:ring-4 focus:ring-moss/10"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-ink-muted bg-surface border border-moss/15 rounded px-1.5 py-0.5">
            F2
          </kbd>

          {results.length > 0 && (
            <ul
              id="pos-results"
              role="listbox"
              className="absolute z-20 left-0 right-0 mt-2 bg-white border border-moss/20 rounded-2xl shadow-2xl overflow-hidden max-h-[420px] overflow-y-auto"
            >
              {results.map((sku, idx) => (
                <li
                  key={sku.skuId}
                  id={`pos-r-${sku.skuId}`}
                  role="option"
                  aria-selected={idx === highlight}
                  onMouseEnter={() => setHighlight(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addSku(sku)}
                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer ${idx === highlight ? 'bg-moss/10' : ''}`}
                >
                  <div className="w-10 h-10 rounded-lg bg-surface overflow-hidden shrink-0 flex items-center justify-center">
                    {sku.mainImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sku.mainImageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span
                        className="w-5 h-5 rounded-full border border-black/10"
                        style={{ backgroundColor: sku.colorHex || '#e2e8f0' }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink truncate">{sku.description}</p>
                    <p className="text-xs text-ink-muted font-mono">{sku.skuCode}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-ink tabular-nums">{formatNIO(sku.price)}</p>
                    <p className={`text-xs font-semibold ${sku.available > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {sku.available > 0 ? `${sku.available} disp.` : 'Sin existencia'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p
          aria-live="polite"
          className={`min-h-[1.25rem] text-sm font-medium ${feedback?.tone === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}
        >
          {feedback?.text}
        </p>

        {lines.length === 0 ? (
          <div className="erp-card p-10 text-center text-ink-muted">
            <ShoppingCart className="w-10 h-10 mx-auto text-moss/30 mb-3" aria-hidden="true" />
            <p className="font-semibold text-ink">Carrito vacío</p>
            <p className="text-sm mt-1">Escanee una etiqueta o busque la prenda y presione Enter.</p>
            <p className="text-xs mt-3 flex items-center justify-center gap-1.5">
              <Keyboard className="w-3.5 h-3.5" aria-hidden="true" />
              Enter con la búsqueda vacía suma otra unidad de la última prenda.
            </p>
          </div>
        ) : (
          <ul className="space-y-2" aria-label="Carrito">
            {lines.map((line) => {
              const sku = skus.find((s) => s.skuId === line.skuId);
              const available = sku?.available ?? 0;
              const over = line.quantity > available;
              const discounted = line.unitPrice < line.regularPrice;
              return (
                <li
                  key={line.skuId}
                  className={`erp-card p-3 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors ${
                    flashSku === line.skuId ? 'ring-2 ring-emerald-400 bg-emerald-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-lg bg-surface overflow-hidden shrink-0 flex items-center justify-center">
                      {line.mainImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={line.mainImageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ShoppingCart className="w-5 h-5 text-moss/30" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink truncate">{line.productName}</p>
                      <p className="text-xs text-ink-muted">
                        <span className="font-mono">{line.skuCode}</span>
                        {[line.size, line.colorName].filter(Boolean).length > 0 && ` · ${[line.size, line.colorName].filter(Boolean).join(' · ')}`}
                      </p>
                      {over && (
                        <p className="text-xs font-semibold text-amber-700 mt-0.5">
                          {available === 0 ? 'Sin existencia' : `Solo ${available} disponible(s)`} · puede venderse como pedido
                        </p>
                      )}
                    </div>
                    <span className="sm:hidden">
                      <button
                      type="button"
                      onClick={() => removeLine(line.skuId)}
                      className="p-2 rounded-lg text-ink-muted hover:text-rose-700 hover:bg-rose-50 shrink-0"
                      aria-label={`Quitar ${line.productName}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 justify-between sm:justify-end">
                    <div className="flex items-center gap-1" role="group" aria-label={`Cantidad de ${line.productName}`}>
                      <button
                        type="button"
                        onClick={() => (line.quantity <= 1 ? removeLine(line.skuId) : updateLine(line.skuId, { quantity: line.quantity - 1 }))}
                        className="w-8 h-8 rounded-lg border border-moss/20 flex items-center justify-center hover:bg-surface"
                        aria-label="Quitar una"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(line.skuId, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        className="w-12 text-center border border-moss/20 rounded-lg py-1.5 text-sm font-bold tabular-nums"
                        aria-label="Cantidad"
                      />
                      <button
                        type="button"
                        onClick={() => updateLine(line.skuId, { quantity: line.quantity + 1 })}
                        className="w-8 h-8 rounded-lg border border-moss/20 flex items-center justify-center hover:bg-surface"
                        aria-label="Agregar una"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="w-24 sm:w-28 text-right">
                      <label className="sr-only" htmlFor={`price-${line.skuId}`}>Precio unitario</label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-ink-muted">C$</span>
                        <input
                          id={`price-${line.skuId}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(line.skuId, { unitPrice: Math.max(0, parseFloat(e.target.value) || 0) })}
                          className="w-full text-right border border-moss/20 rounded-lg pl-7 pr-2 py-1.5 text-sm tabular-nums"
                          title="Precio por unidad (puede rebajarlo)"
                        />
                      </div>
                      {discounted && <p className="text-xs text-ink-muted line-through tabular-nums mt-0.5">{formatNIO(line.regularPrice)}</p>}
                    </div>

                    <p className="sm:w-24 text-right text-sm font-bold text-ink tabular-nums">{formatNIO(line.unitPrice * line.quantity)}</p>
                    <span className="hidden sm:block">
                      <button
                      type="button"
                      onClick={() => removeLine(line.skuId)}
                      className="p-2 rounded-lg text-ink-muted hover:text-rose-700 hover:bg-rose-50 shrink-0"
                      aria-label={`Quitar ${line.productName}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Derecha: cliente, total y cobrar */}
      <aside aria-label="Resumen de la venta" className="space-y-4 lg:sticky lg:top-0 self-start">
        <div className="erp-card p-4 space-y-4">
          <CustomerPicker customers={customers} selectedId={customerId} onSelect={setCustomerId} inputRef={customerRef} />

          <div className="border-t border-moss/10 pt-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-ink-muted">
              <span>Prendas</span>
              <span className="tabular-nums">{units}</span>
            </div>
            {savings > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Ahorro en promociones</span>
                <span className="tabular-nums">−{formatNIO(savings)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-1">
              <span className="font-bold text-ink">Total</span>
              <span className="text-3xl font-black text-moss tabular-nums">{formatNIO(total)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={openCheckout}
            disabled={lines.length === 0}
            className="hidden lg:flex w-full items-center justify-center gap-2 py-4 rounded-2xl bg-moss hover:bg-moss-700 text-white text-lg font-black shadow-lg shadow-moss/20 disabled:opacity-40"
          >
            Cobrar
            <kbd className="text-xs bg-white/15 rounded px-1.5 py-0.5 font-semibold">F9</kbd>
          </button>

          {lines.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-rose-700"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" /> Vaciar carrito
            </button>
          )}
        </div>

        <div className="hidden lg:block text-xs text-ink-muted px-1 space-y-1">
          <p className="font-bold uppercase tracking-wide">Atajos</p>
          <p><kbd className="font-semibold">F2</kbd> buscar · <kbd className="font-semibold">F4</kbd> cliente · <kbd className="font-semibold">F9</kbd> cobrar</p>
          <p><kbd className="font-semibold">↑ ↓</kbd> elegir · <kbd className="font-semibold">Enter</kbd> agregar · <kbd className="font-semibold">Esc</kbd> limpiar</p>
        </div>
      </aside>

      {/* Barra inferior en celular/tableta */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-moss/15 p-3 flex items-center gap-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="flex-1">
          <p className="text-xs text-ink-muted">{units} prendas</p>
          <p className="text-xl font-black text-moss tabular-nums">{formatNIO(total)}</p>
        </div>
        <button
          type="button"
          onClick={openCheckout}
          disabled={lines.length === 0}
          className="px-6 py-3 rounded-xl bg-moss text-white font-black disabled:opacity-40"
        >
          Cobrar
        </button>
      </div>

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => {
          setCheckoutOpen(false);
          setTimeout(() => searchRef.current?.focus(), 0);
        }}
        lines={lines}
        total={total}
        customer={customer}
        isWalkIn={customer.id === WALK_IN_CUSTOMER_ID}
        onChangeCustomer={() => {
          setCheckoutOpen(false);
          setTimeout(() => customerRef.current?.focus(), 50);
        }}
        onConfirm={handleConfirm}
      />

      <SaleDoneModal invoice={doneInvoice} onNewSale={startNewSale} />

      <ConfirmDialog
        isOpen={confirmClear}
        title="¿Vaciar el carrito?"
        confirmLabel="Vaciar"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setLines([]);
          setConfirmClear(false);
          toast.info('Carrito vaciado.');
          setTimeout(() => searchRef.current?.focus(), 0);
        }}
      >
        <p>
          Se quitarán {units} prenda(s) por {formatNIO(total)}. No se registra ninguna venta.
        </p>
      </ConfirmDialog>
    </div>
  );
}
