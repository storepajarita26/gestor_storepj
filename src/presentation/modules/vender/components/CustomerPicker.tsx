'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UserRound, UserPlus, X, AlertTriangle } from 'lucide-react';
import { Customer } from '@/domain/sales/types';
import { customerMatches, summarizeCustomer } from '@/domain/sales/services/customerService';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { dataStore, WALK_IN_CUSTOMER_ID } from '@/infrastructure/repositories/dataStore';

interface CustomerPickerProps {
  customers: Customer[];
  selectedId: string;
  onSelect: (customerId: string) => void;
  /** El punto de venta lo enfoca con F4 */
  inputRef: React.RefObject<HTMLInputElement>;
}

/**
 * Cliente de la venta: por defecto "Consumidor final". Se busca por nombre, teléfono o cédula,
 * y se crea al momento solo con el nombre (teléfono opcional).
 */
export function CustomerPicker({ customers, selectedId, onSelect, inputRef }: CustomerPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const selected = customers.find((c) => c.id === selectedId);
  const isWalkIn = selectedId === WALK_IN_CUSTOMER_ID;

  const summary = useMemo(() => {
    if (!selected || isWalkIn) return null;
    return summarizeCustomer(selected, dataStore.getInvoices(), dataStore.getDefaultCreditDays());
  }, [selected, isWalkIn]);

  const results = useMemo(() => {
    const real = customers.filter((c) => c.id !== WALK_IN_CUSTOMER_ID);
    const matches = query.trim() ? real.filter((c) => customerMatches(c, query)) : real.slice(0, 5);
    return matches.slice(0, 6);
  }, [customers, query]);

  // Opciones navegables con flechas: consumidor final, coincidencias y "crear"
  const options: { kind: 'walkin' | 'customer' | 'create'; customer?: Customer }[] = [
    { kind: 'walkin' },
    ...results.map((c) => ({ kind: 'customer' as const, customer: c })),
    ...(query.trim() ? [{ kind: 'create' as const }] : []),
  ];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => setHighlight(0), [query]);

  const choose = (customerId: string) => {
    onSelect(customerId);
    setQuery('');
    setOpen(false);
    setCreating(false);
  };

  const startCreate = () => {
    const q = query.trim();
    const looksLikePhone = q.replace(/[\s+-]/g, '').length >= 7 && /^[\d\s+-]+$/.test(q);
    setNewName(looksLikePhone ? '' : q);
    setNewPhone(looksLikePhone ? q : '');
    setCreating(true);
    setTimeout(() => nameRef.current?.focus(), 0);
  };

  const pick = (idx: number) => {
    const opt = options[idx];
    if (!opt) return;
    if (opt.kind === 'walkin') choose(WALK_IN_CUSTOMER_ID);
    else if (opt.kind === 'customer' && opt.customer) choose(opt.customer.id);
    else startCreate();
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const created = dataStore.addCustomer({
      fullName: newName.trim(),
      phoneWhatsapp: newPhone.trim() || undefined,
      city: 'Managua',
    });
    choose(created.id);
  };

  return (
    <div ref={containerRef} className="relative space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor="pos-customer" className="text-xs font-bold text-ink-muted uppercase tracking-wide">
          Cliente de la Factura
        </label>
        <kbd className="font-semibold normal-case text-[10px] bg-white border border-moss/15 rounded px-1.5">F4</kbd>
      </div>

      {/* Selector rápido: Cliente Invitado (Sin datos, solo contado) vs Cliente Registrado */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-surface rounded-xl border border-moss/15">
        <button
          type="button"
          onClick={() => choose(WALK_IN_CUSTOMER_ID)}
          className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
            isWalkIn && !open
              ? 'bg-moss text-white shadow-xs'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <UserRound className="w-3.5 h-3.5" />
          <span>Invitado (Sin datos)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setQuery('');
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
            !isWalkIn || open
              ? 'bg-moss text-white shadow-xs'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>{!isWalkIn && selected ? 'Cambiar Cliente' : 'Con Cliente'}</span>
        </button>
      </div>

      <div className="relative">
        <UserRound className="w-4 h-4 text-moss absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
        <input
          id="pos-customer"
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="pos-customer-list"
          autoComplete="off"
          value={
            open
              ? query
              : isWalkIn
              ? 'Cliente Invitado (Consumidor Final)'
              : selected?.fullName || 'Cliente Invitado (Consumidor Final)'
          }
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setCreating(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, options.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              pick(highlight);
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
              setCreating(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="Buscar por nombre, teléfono o crear nuevo..."
          className="w-full bg-white border border-moss/20 rounded-xl pl-9 pr-9 py-2.5 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-moss/30 focus:border-moss"
        />
        {!isWalkIn && !open && (
          <button
            type="button"
            onClick={() => choose(WALK_IN_CUSTOMER_ID)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-surface"
            aria-label="Usar Cliente Invitado sin datos"
            title="Quitar cliente y facturar como Invitado (sin datos)"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Estado de Cliente Invitado vs Cliente con Datos */}
      {!open && isWalkIn && (
        <div className="px-2.5 py-1.5 rounded-lg bg-moss/5 border border-moss/15 flex items-center justify-between text-[11px]">
          <span className="text-ink-muted">Sin pedir datos personales</span>
          <span className="font-bold text-moss bg-moss/10 px-2 py-0.5 rounded">Solo Contado</span>
        </div>
      )}

      {/* Datos del cliente elegido */}
      {!open && selected && !isWalkIn && (
        <div className="mt-1.5 text-xs text-ink-muted space-y-0.5">
          {selected.phoneWhatsapp && <p>Tel. {selected.phoneWhatsapp}</p>}
          {summary && summary.balanceDueNio > 0 && (
            <p className={`flex items-center gap-1 font-semibold ${summary.overdueNio > 0 ? 'text-rose-700' : 'text-amber-700'}`}>
              {summary.overdueNio > 0 && <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />}
              Saldo pendiente {formatNIO(summary.balanceDueNio)}
              {summary.overdueNio > 0 ? ` · ${formatNIO(summary.overdueNio)} vencido` : ''}
            </p>
          )}
        </div>
      )}

      {open && (
        <div
          id="pos-customer-list"
          className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-moss/20 rounded-xl shadow-xl overflow-hidden"
        >
          {creating ? (
            <form onSubmit={handleCreate} className="p-3 space-y-2">
              <p className="text-xs font-bold text-ink">Nuevo cliente</p>
              <input
                ref={nameRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre *"
                required
                className="w-full border border-moss/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-moss/30"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setCreating(false);
                  }
                }}
              />
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="WhatsApp (opcional)"
                inputMode="tel"
                className="w-full border border-moss/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-moss/30"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setCreating(false)} className="px-3 py-1.5 text-xs font-semibold text-ink-muted hover:text-ink">
                  Cancelar
                </button>
                <button type="submit" className="px-3 py-1.5 text-xs font-bold text-white bg-moss rounded-lg hover:bg-moss-700">
                  Crear y usar
                </button>
              </div>
            </form>
          ) : (
            <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
              {options.map((opt, idx) => {
                const active = idx === highlight;
                const base = `w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${active ? 'bg-moss/10' : 'hover:bg-surface'}`;
                if (opt.kind === 'walkin') {
                  return (
                    <li key="walkin" role="option" aria-selected={active}>
                      <button type="button" className={base} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(idx)}>
                        <UserRound className="w-4 h-4 text-moss" aria-hidden="true" />
                        <span className="font-semibold">Cliente Invitado (Consumidor Final)</span>
                        <span className="text-xs text-moss font-bold bg-moss/10 px-1.5 py-0.5 rounded ml-auto">
                          Sin datos · Contado
                        </span>
                      </button>
                    </li>
                  );
                }
                if (opt.kind === 'customer' && opt.customer) {
                  return (
                    <li key={opt.customer.id} role="option" aria-selected={active}>
                      <button type="button" className={base} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(idx)}>
                        <span className="w-7 h-7 rounded-full bg-moss/10 text-moss text-xs font-bold flex items-center justify-center shrink-0">
                          {opt.customer.fullName.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold truncate">{opt.customer.fullName}</span>
                          <span className="block text-xs text-ink-muted truncate">
                            {[opt.customer.phoneWhatsapp, opt.customer.city].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                }
                return (
                  <li key="create" role="option" aria-selected={active} className="border-t border-moss/10">
                    <button type="button" className={`${base} text-moss font-semibold`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(idx)}>
                      <UserPlus className="w-4 h-4" aria-hidden="true" />
                      Crear cliente «{query.trim()}»
                    </button>
                  </li>
                );
              })}
              <li className="border-t border-moss/10">
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs font-bold text-moss hover:bg-surface flex items-center gap-2"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => startCreate()}
                >
                  <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>+ Registrar nuevo cliente...</span>
                </button>
              </li>
              {query.trim() && results.length === 0 && (
                <li className="px-3 py-1.5 text-xs text-ink-muted">Ningún cliente coincide.</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
