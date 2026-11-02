'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, UserPlus, Users, Wallet, AlertTriangle, MessageCircle } from 'lucide-react';
import { dataStore, WALK_IN_CUSTOMER_ID } from '@/infrastructure/repositories/dataStore';
import { Customer, SalesInvoice } from '@/domain/sales/types';
import { CustomerSummary, customerMatches, summarizeCustomer } from '@/domain/sales/services/customerService';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { openWhatsapp } from '@/domain/shared/utils/whatsapp';
import { StatCard } from '@/presentation/components/ui/StatCard';
import { Pagination } from '@/presentation/components/ui/Pagination';
import { useDeepLink } from '@/presentation/hooks/useDeepLink';
import { CustomerDetailModal } from './components/CustomerDetailModal';

type Filter = 'todos' | 'con_saldo' | 'vencidos';
type SortKey = 'nombre' | 'saldo' | 'compras' | 'reciente';

function formatDate(iso?: string) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function ClientesView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [sort, setSort] = useState<SortKey>('reciente');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setCustomers(dataStore.getCustomers());
      setInvoices(dataStore.getInvoices());
    };
    refresh();
    setLoaded(true);
    return dataStore.subscribe(refresh);
  }, []);

  useDeepLink('id', (id) => setSelectedId(id), loaded);

  const creditDays = dataStore.getDefaultCreditDays();
  const summaries: CustomerSummary[] = useMemo(
    () =>
      customers
        .filter((c) => c.id !== WALK_IN_CUSTOMER_ID)
        .map((c) => summarizeCustomer(c, invoices, creditDays)),
    [customers, invoices, creditDays]
  );

  const filtered = useMemo(() => {
    const list = summaries.filter((s) => {
      if (filter === 'con_saldo' && s.balanceDueNio <= 0.009) return false;
      if (filter === 'vencidos' && s.overdueNio <= 0.009) return false;
      return customerMatches(s.customer, query);
    });
    return list.sort((a, b) => {
      if (sort === 'nombre') return a.customer.fullName.localeCompare(b.customer.fullName);
      if (sort === 'saldo') return b.overdueNio - a.overdueNio || b.balanceDueNio - a.balanceDueNio;
      if (sort === 'compras') return b.totalPurchasedNio - a.totalPurchasedNio;
      return (b.lastPurchaseDate || b.customer.createdAt || '').localeCompare(a.lastPurchaseDate || a.customer.createdAt || '');
    });
  }, [summaries, filter, query, sort]);

  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  const totals = useMemo(
    () => ({
      receivable: summaries.reduce((a, s) => a + s.balanceDueNio, 0),
      overdue: summaries.reduce((a, s) => a + s.overdueNio, 0),
      withBalance: summaries.filter((s) => s.balanceDueNio > 0.009).length,
      overdueCount: summaries.filter((s) => s.overdueNio > 0.009).length,
    }),
    [summaries]
  );

  const selected = customers.find((c) => c.id === selectedId) || null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Clientes" value={summaries.length} subtitle={`${totals.withBalance} con saldo`} icon={Users} accentColor="moss" />
        <StatCard title="Por cobrar" value={formatNIO(totals.receivable)} subtitle="Saldo total de clientes" icon={Wallet} accentColor="amber" />
        <StatCard
          title="Vencido"
          value={formatNIO(totals.overdue)}
          subtitle={`${totals.overdueCount} cliente(s) atrasados`}
          icon={AlertTriangle}
          accentColor="mustard"
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <label htmlFor="cust-search" className="sr-only">Buscar cliente</label>
          <input
            id="cust-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nombre, teléfono o cédula"
            className="w-full bg-white border border-moss/20 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-moss/30"
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div role="group" aria-label="Filtrar clientes" className="flex rounded-xl border border-moss/20 overflow-hidden text-sm">
            {(
              [
                ['todos', 'Todos'],
                ['con_saldo', `Con saldo (${totals.withBalance})`],
                ['vencidos', `Vencidos (${totals.overdueCount})`],
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => {
                  setFilter(key);
                  setPage(1);
                }}
                className={`px-3 py-2 font-semibold ${filter === key ? 'bg-moss text-white' : 'bg-white text-ink hover:bg-surface'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label htmlFor="cust-sort" className="sr-only">Ordenar</label>
          <select
            id="cust-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="border border-moss/20 rounded-xl px-3 py-2 text-sm bg-white"
          >
            <option value="reciente">Compra más reciente</option>
            <option value="saldo">Mayor atraso / saldo</option>
            <option value="compras">Más compras</option>
            <option value="nombre">Nombre A–Z</option>
          </select>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-moss hover:bg-moss-700 text-white text-sm font-bold"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" /> Nuevo cliente
          </button>
        </div>
      </div>

      <div className="erp-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-ink-muted">
            <Users className="w-10 h-10 mx-auto text-moss/30 mb-2" aria-hidden="true" />
            <p className="font-semibold text-ink">{summaries.length === 0 ? 'Aún no hay clientes' : 'Ningún cliente coincide'}</p>
            <p className="text-sm mt-1">
              {summaries.length === 0 ? 'Se registran al vender o con «Nuevo cliente».' : 'Pruebe con otro nombre o quite el filtro.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-xs text-ink-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Cliente</th>
                  <th className="text-right px-4 py-3 font-semibold">Compras</th>
                  <th className="text-right px-4 py-3 font-semibold">Total comprado</th>
                  <th className="text-right px-4 py-3 font-semibold">Saldo</th>
                  <th className="text-left px-4 py-3 font-semibold">Atraso</th>
                  <th className="text-left px-4 py-3 font-semibold">Última compra</th>
                  <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {paged.map((s) => (
                  <tr key={s.customer.id} className="border-t border-moss/10 hover:bg-surface/60">
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setSelectedId(s.customer.id)} className="text-left group">
                        <span className="block font-semibold text-ink group-hover:text-moss group-hover:underline">{s.customer.fullName}</span>
                        <span className="block text-xs text-ink-muted">
                          {[s.customer.phoneWhatsapp, s.customer.city].filter(Boolean).join(' · ') || 'Sin teléfono'}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.purchasesCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatNIO(s.totalPurchasedNio)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${s.balanceDueNio > 0.009 ? 'font-bold text-amber-700' : 'text-ink-muted'}`}>
                      {s.balanceDueNio > 0.009 ? formatNIO(s.balanceDueNio) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {s.overdueNio > 0.009 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 text-rose-800 text-xs font-bold">
                          {s.maxDaysOverdue} días · {formatNIO(s.overdueNio)}
                        </span>
                      ) : s.balanceDueNio > 0.009 ? (
                        <span className="text-xs text-emerald-700 font-semibold">Al día</span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink-muted">{formatDate(s.lastPurchaseDate)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openWhatsapp(s.customer.phoneWhatsapp, `¡Hola ${s.customer.fullName.split(' ')[0]}! `)}
                        disabled={!s.customer.phoneWhatsapp}
                        className="p-2 rounded-lg text-emerald-700 hover:bg-emerald-50 disabled:opacity-30"
                        aria-label={`Escribir a ${s.customer.fullName} por WhatsApp`}
                        title="WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > perPage && (
          <Pagination
            currentPage={page}
            totalPages={Math.ceil(filtered.length / perPage)}
            totalItems={filtered.length}
            itemsPerPage={perPage}
            onPageChange={setPage}
            onItemsPerPageChange={(n: number) => {
              setPerPage(n);
              setPage(1);
            }}
          />
        )}
      </div>

      <CustomerDetailModal
        customer={selected}
        isNew={creating}
        invoices={invoices}
        onClose={() => {
          setSelectedId(null);
          setCreating(false);
        }}
      />
    </div>
  );
}
