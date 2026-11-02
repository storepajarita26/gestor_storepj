import { Customer, SalesInvoice } from '../types';

/**
 * Cuentas por cobrar: vencimientos, antigüedad de saldos y resumen por cliente.
 * Funciones puras (sin acceso a datos) para poder usarlas en cualquier vista.
 */

export type AgingBucket = 'al_dia' | 'vencido_1_30' | 'vencido_31_60' | 'vencido_60_mas';

export const AGING_BUCKETS: { key: AgingBucket; label: string; short: string }[] = [
  { key: 'al_dia', label: 'Al día (por vencer)', short: 'Al día' },
  { key: 'vencido_1_30', label: 'Vencido 1–30 días', short: '1–30 días' },
  { key: 'vencido_31_60', label: 'Vencido 31–60 días', short: '31–60 días' },
  { key: 'vencido_60_mas', label: 'Vencido más de 60 días', short: '+60 días' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha local AAAA-MM-DD (sin desfase por zona horaria) */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function parseIsoDate(isoDate: string): Date {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Factura con saldo por cobrar (no anulada) */
export function isReceivable(inv: SalesInvoice): boolean {
  return inv.status !== 'anulada' && (inv.balanceDueNio || 0) > 0.009;
}

/**
 * Vencimiento de una factura. Las facturas sin fecha de vencimiento (anteriores a la Fase 3)
 * vencen a los días de crédito por defecto desde su emisión: se marca como "estimado".
 */
export function getDueDate(inv: SalesInvoice, defaultCreditDays: number): { date: string; estimated: boolean } {
  if (inv.dueDate) return { date: inv.dueDate.slice(0, 10), estimated: false };
  return { date: addDays(inv.issueDate || toIsoDate(new Date()), defaultCreditDays), estimated: true };
}

/** Días de atraso (negativo = días que faltan para vencer) */
export function getDaysOverdue(inv: SalesInvoice, defaultCreditDays: number, today: Date = new Date()): number {
  const due = parseIsoDate(getDueDate(inv, defaultCreditDays).date);
  const base = parseIsoDate(toIsoDate(today));
  return Math.round((base.getTime() - due.getTime()) / DAY_MS);
}

export function getAgingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'al_dia';
  if (daysOverdue <= 30) return 'vencido_1_30';
  if (daysOverdue <= 60) return 'vencido_31_60';
  return 'vencido_60_mas';
}

export interface AgingSummary {
  totals: Record<AgingBucket, number>;
  counts: Record<AgingBucket, number>;
  totalReceivable: number;
  totalOverdue: number;
}

export function summarizeAging(invoices: SalesInvoice[], defaultCreditDays: number, today: Date = new Date()): AgingSummary {
  const totals = { al_dia: 0, vencido_1_30: 0, vencido_31_60: 0, vencido_60_mas: 0 } as Record<AgingBucket, number>;
  const counts = { al_dia: 0, vencido_1_30: 0, vencido_31_60: 0, vencido_60_mas: 0 } as Record<AgingBucket, number>;
  invoices.filter(isReceivable).forEach((inv) => {
    const bucket = getAgingBucket(getDaysOverdue(inv, defaultCreditDays, today));
    totals[bucket] += inv.balanceDueNio;
    counts[bucket] += 1;
  });
  const totalReceivable = Object.values(totals).reduce((a, b) => a + b, 0);
  return { totals, counts, totalReceivable, totalOverdue: totalReceivable - totals.al_dia };
}

export interface CustomerSummary {
  customer: Customer;
  invoices: SalesInvoice[];
  purchasesCount: number;
  totalPurchasedNio: number;
  averageTicketNio: number;
  balanceDueNio: number;
  overdueNio: number;
  maxDaysOverdue: number;
  lastPurchaseDate?: string;
  /** Tallas y colores más comprados (para recomendar) */
  topSizes: { label: string; units: number }[];
  topColors: { label: string; units: number }[];
}

function topCounts(values: Map<string, number>, limit = 3) {
  return Array.from(values.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, units]) => ({ label, units }));
}

export function summarizeCustomer(
  customer: Customer,
  allInvoices: SalesInvoice[],
  defaultCreditDays: number,
  today: Date = new Date()
): CustomerSummary {
  const invoices = allInvoices
    .filter((inv) => inv.customerId === customer.id)
    .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const valid = invoices.filter((inv) => inv.status !== 'anulada');
  const totalPurchasedNio = valid.reduce((acc, inv) => acc + (inv.totalNio || 0) - (inv.creditedNio || 0), 0);

  let balanceDueNio = 0;
  let overdueNio = 0;
  let maxDaysOverdue = 0;
  valid.filter(isReceivable).forEach((inv) => {
    balanceDueNio += inv.balanceDueNio;
    const days = getDaysOverdue(inv, defaultCreditDays, today);
    if (days > 0) {
      overdueNio += inv.balanceDueNio;
      maxDaysOverdue = Math.max(maxDaysOverdue, days);
    }
  });

  const sizes = new Map<string, number>();
  const colors = new Map<string, number>();
  valid.forEach((inv) =>
    (inv.items || []).forEach((it) => {
      if (it.size) sizes.set(it.size, (sizes.get(it.size) || 0) + it.quantity);
      if (it.colorName) colors.set(it.colorName, (colors.get(it.colorName) || 0) + it.quantity);
    })
  );

  return {
    customer,
    invoices,
    purchasesCount: valid.length,
    totalPurchasedNio,
    averageTicketNio: valid.length > 0 ? totalPurchasedNio / valid.length : 0,
    balanceDueNio,
    overdueNio,
    maxDaysOverdue,
    lastPurchaseDate: valid[0]?.issueDate,
    topSizes: topCounts(sizes),
    topColors: topCounts(colors),
  };
}

/** Búsqueda flexible por nombre, teléfono o cédula (sin acentos ni guiones) */
export function normalizeSearch(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function customerMatches(customer: Customer, query: string): boolean {
  const q = normalizeSearch(query.trim());
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  const name = normalizeSearch(customer.fullName);
  if (q.split(/\s+/).every((word) => name.includes(word))) return true;
  if (digits.length >= 3 && (customer.phoneWhatsapp || '').replace(/\D/g, '').includes(digits)) return true;
  const idQuery = q.replace(/[^a-z0-9]/g, '');
  if (idQuery.length >= 3 && normalizeSearch(customer.identificationNumber || '').replace(/[^a-z0-9]/g, '').includes(idQuery)) return true;
  return false;
}
