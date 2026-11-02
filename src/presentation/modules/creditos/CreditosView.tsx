'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Plus,
  Search,
  Clock,
  CheckCircle2,
  History,
  MessageCircle,
} from 'lucide-react';
import { StatusBadge } from '@/presentation/components/ui/StatusBadge';
import { Modal } from '@/presentation/components/ui/Modal';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { SalesInvoice, PaymentMethod } from '@/domain/sales/types';
import { useToast } from '@/presentation/components/ui/Toast';
import { useDeepLink } from '@/presentation/hooks/useDeepLink';
import {
  AGING_BUCKETS,
  AgingBucket,
  getAgingBucket,
  getDaysOverdue,
  getDueDate,
  isReceivable,
  summarizeAging,
} from '@/domain/sales/services/customerService';
import { buildReminderMessage, openWhatsapp } from '@/domain/shared/utils/whatsapp';

function formatShortDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function CreditosView() {
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [bucketFilter, setBucketFilter] = useState<AgingBucket | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // New Payment Form
  const [paymentAmountNio, setPaymentAmountNio] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo_cordobas');
  const [amountUsd, setAmountUsd] = useState<number>(0);
  const [rateApplied, setRateApplied] = useState<number>(dataStore.getExchangeRate());
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const isUsd = paymentMethod === 'efectivo_dolares';
  // En dólares el monto se captura en US$ y se convierte con la tasa del día (queda guardada en el recibo)
  const effectiveAmountNio = isUsd ? Number((amountUsd * rateApplied).toFixed(2)) : paymentAmountNio;
  const exceedsBalance = selectedInvoice ? effectiveAmountNio > selectedInvoice.balanceDueNio + 0.01 : false;

  const refreshData = () => {
    setInvoices(dataStore.getInvoices());
  };

  useEffect(() => {
    refreshData();
    const unsub = dataStore.subscribe(refreshData);
    return unsub;
  }, []);

  const handleOpenPaymentModal = (invoice: SalesInvoice) => {
    setSelectedInvoice(invoice);
    // Por defecto se sugiere el saldo completo; el usuario lo baja si es un abono parcial
    setPaymentAmountNio(invoice.balanceDueNio);
    const rate = dataStore.getExchangeRate();
    setRateApplied(rate);
    setAmountUsd(rate > 0 ? Number((invoice.balanceDueNio / rate).toFixed(2)) : 0);
    setPaymentMethod('efectivo_cordobas');
    setReferenceNumber('');
    setNotes('');
    setIsPaymentModalOpen(true);
  };

  // Búsqueda global: /creditos?factura=<id> abre el abono de esa factura
  useDeepLink(
    'factura',
    (id) => {
      const inv = dataStore.getInvoices().find((i) => i.id === id);
      if (inv && inv.balanceDueNio > 0 && inv.status !== 'anulada') handleOpenPaymentModal(inv);
      else if (inv) handleOpenHistoryModal(inv);
    },
    invoices.length > 0
  );

  const handleOpenHistoryModal = (invoice: SalesInvoice) => {
    setSelectedInvoice(invoice);
    setIsHistoryModalOpen(true);
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || effectiveAmountNio <= 0 || exceedsBalance) return;

    setSaving(true);
    const res = await dataStore.registerPayment({
      invoiceId: selectedInvoice.id,
      amountNio: effectiveAmountNio,
      amountUsd: isUsd ? amountUsd : undefined,
      exchangeRateApplied: isUsd ? rateApplied : undefined,
      paymentMethod,
      referenceNumber,
      notes,
    });
    setSaving(false);

    if (!res.success) toast.error(res.message, 'Abono no registrado');
    else if (res.sync === 'pending') toast.warning(res.message, 'Abono registrado');
    else toast.success(res.message, 'Abono registrado');
    if (res.success) setIsPaymentModalOpen(false);
  };

  // Las facturas anuladas no son cuentas por cobrar
  const creditInvoices = invoices.filter(
    (inv) =>
      inv.status !== 'anulada' &&
      (inv.paymentTerm === 'credito' ||
        inv.balanceDueNio > 0 ||
        (inv.payments && inv.payments.length > 0))
  );

  const creditDays = dataStore.getDefaultCreditDays();
  const aging = useMemo(() => summarizeAging(invoices, creditDays), [invoices, creditDays]);

  const filteredCreditInvoices = creditInvoices
    .filter((inv) => showPaid || isReceivable(inv))
    .filter((inv) => {
      if (!bucketFilter) return true;
      return isReceivable(inv) && getAgingBucket(getDaysOverdue(inv, creditDays)) === bucketFilter;
    })
    .filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.customerName || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    // Primero lo más atrasado; las pagadas al final
    .sort((a, b) => {
      const ra = isReceivable(a) ? getDaysOverdue(a, creditDays) : -99999;
      const rb = isReceivable(b) ? getDaysOverdue(b, creditDays) : -99999;
      return rb - ra;
    });

  const sendReminder = (inv: SalesInvoice) => {
    // Un solo mensaje con todo lo que debe el cliente
    const pending = invoices
      .filter((i) => i.customerId === inv.customerId && isReceivable(i))
      .map((i) => ({
        invoiceNumber: i.invoiceNumber,
        balanceDueNio: i.balanceDueNio,
        dueDate: getDueDate(i, creditDays).date,
        daysOverdue: getDaysOverdue(i, creditDays),
      }));
    openWhatsapp(
      inv.customerPhone,
      buildReminderMessage(inv.customerName || '', dataStore.getStoreSettings().storeName || 'Pajarita Store', pending)
    );
  };

  const BUCKET_STYLE: Record<AgingBucket, string> = {
    al_dia: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    vencido_1_30: 'border-amber-200 bg-amber-50 text-amber-900',
    vencido_31_60: 'border-orange-300 bg-orange-50 text-orange-900',
    vencido_60_mas: 'border-rose-300 bg-rose-50 text-rose-900',
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Antigüedad de saldos: cuánto está al día y cuánto vencido */}
      <section aria-label="Antigüedad de saldos" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2 lg:col-span-1 erp-card p-4 rounded-2xl border border-mustard/40 bg-mustard/15">
          <p className="text-xs font-bold text-moss-900 uppercase tracking-wide flex items-center gap-1.5">
            <Clock className="w-4 h-4" aria-hidden="true" /> Por cobrar
          </p>
          <p className="text-2xl font-extrabold text-ink tabular-nums">{formatNIO(aging.totalReceivable)}</p>
          <p className="text-xs text-ink-muted">{formatNIO(aging.totalOverdue)} vencido</p>
        </div>
        {AGING_BUCKETS.map((b) => {
          const active = bucketFilter === b.key;
          return (
            <button
              key={b.key}
              type="button"
              aria-pressed={active}
              onClick={() => setBucketFilter(active ? null : b.key)}
              className={`text-left p-4 rounded-2xl border transition-shadow ${BUCKET_STYLE[b.key]} ${
                active ? 'ring-2 ring-offset-1 ring-moss shadow-md' : 'hover:shadow-sm'
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-wide">{b.short}</p>
              <p className="text-xl font-extrabold tabular-nums">{formatNIO(aging.totals[b.key])}</p>
              <p className="text-xs opacity-80">{aging.counts[b.key]} factura(s)</p>
            </button>
          );
        })}
      </section>

      {/* Filter Bar */}
      <div className="erp-card p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-surface border border-moss/15 rounded-xl px-3 py-2 w-full sm:w-80 shadow-xs">
          <Search className="w-4 h-4 text-ink-muted" aria-hidden="true" />
          <label htmlFor="cred-search" className="sr-only">Buscar por cliente o factura</label>
          <input
            id="cred-search"
            type="text"
            placeholder="Buscar por cliente o factura..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-sm text-ink placeholder-ink-muted focus:outline-none w-full"
          />
        </div>
        <div className="flex items-center gap-4 text-sm">
          {bucketFilter && (
            <button type="button" onClick={() => setBucketFilter(null)} className="font-semibold text-moss hover:underline">
              Quitar filtro «{AGING_BUCKETS.find((b) => b.key === bucketFilter)?.short}»
            </button>
          )}
          <label className="flex items-center gap-2 text-ink-muted cursor-pointer">
            <input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} className="accent-moss w-4 h-4" />
            Incluir pagadas
          </label>
        </div>
      </div>

      {/* Credit Invoices Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredCreditInvoices.length === 0 ? (
          <div className="col-span-2 erp-card p-8 text-center rounded-2xl">
            <CheckCircle2 className="w-8 h-8 text-moss mx-auto mb-2" />
            <p className="text-sm font-bold text-ink">No hay cuentas pendientes de cobro</p>
          </div>
        ) : (
          filteredCreditInvoices.map((inv) => {
            const settled = inv.amountPaidNio + (inv.creditedNio || 0);
            const percentagePaid = inv.totalNio > 0 ? Math.min(100, Math.round((settled / inv.totalNio) * 100)) : 100;
            const receivable = isReceivable(inv);
            const due = getDueDate(inv, creditDays);
            const days = receivable ? getDaysOverdue(inv, creditDays) : 0;
            const bucket = getAgingBucket(days);

            return (
              <div key={inv.id} className="erp-card rounded-2xl p-5 hover:border-moss/30 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between pb-3 border-b border-moss/10">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-ink">{inv.invoiceNumber}</span>
                        <StatusBadge status={inv.status} />
                        {receivable && (
                          <span className={`px-2 py-0.5 rounded-lg border text-xs font-bold ${BUCKET_STYLE[bucket]}`}>
                            {days > 0 ? `Vencida hace ${days} d` : days === 0 ? 'Vence hoy' : `Vence en ${-days} d`}
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/clientes?id=${inv.customerId}`}
                        className="block font-bold text-sm text-ink mt-1 hover:text-moss hover:underline truncate"
                      >
                        {inv.customerName}
                      </Link>
                      <p className="text-xs text-ink-muted truncate">
                        {[inv.customerPhone, receivable ? `vence ${formatShortDate(due.date)}${due.estimated ? ' (estimado)' : ''}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-ink-muted block font-bold">Total Factura</span>
                      <span className="font-extrabold text-ink text-sm">{formatNIO(inv.totalNio)}</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-ink-muted">
                        Abonado: <strong className="text-emerald-800 font-bold">{formatNIO(inv.amountPaidNio)}</strong>
                      </span>
                      <span className="font-bold text-amber-800">
                        Saldo: {formatNIO(inv.balanceDueNio)}
                      </span>
                    </div>
                    <div className="w-full bg-surface-soft rounded-full h-2 overflow-hidden border border-moss/15">
                      <div
                        className="bg-moss h-full rounded-full transition-all duration-300"
                        style={{ width: `${percentagePaid}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-ink-muted mt-1 font-medium">
                      <span>{inv.payments.length} abonos realizados</span>
                      <span className="font-bold text-ink">{percentagePaid}% completado</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-4 mt-4 border-t border-moss/10 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenHistoryModal(inv)}
                      className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink font-bold py-1.5 px-2.5 rounded-lg hover:bg-surface transition-all"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Abonos ({inv.payments.length})</span>
                    </button>
                    {receivable && (
                      <button
                        onClick={() => sendReminder(inv)}
                        className="flex items-center gap-1.5 text-xs text-emerald-800 font-bold py-1.5 px-2.5 rounded-lg hover:bg-emerald-50 transition-all"
                        title={inv.customerPhone ? `Enviar recordatorio a ${inv.customerPhone}` : 'Enviar recordatorio por WhatsApp'}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Recordar</span>
                      </button>
                    )}
                  </div>

                  {inv.balanceDueNio > 0 ? (
                    <button
                      onClick={() => handleOpenPaymentModal(inv)}
                      className="flex items-center gap-1.5 bg-moss hover:bg-moss-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-md shadow-moss/20"
                    >
                      <Plus className="w-3.5 h-3.5 text-mustard" />
                      <span>Registrar Abono</span>
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Pagada al 100%
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Registrar Abono */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={`Registrar Abono - Factura ${selectedInvoice?.invoiceNumber}`}
        subtitle={`Cliente: ${selectedInvoice?.customerName} | Saldo Pendiente: ${formatNIO(selectedInvoice?.balanceDueNio || 0)}`}
        maxWidth="md"
      >
        <form onSubmit={handleRegisterPayment} className="space-y-4">
          <div>
            <label htmlFor="pay-method" className="text-xs font-bold text-ink-muted block mb-1">Método de pago *</label>
            <select
              id="pay-method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-moss"
            >
              <option value="efectivo_cordobas">Efectivo córdobas</option>
              <option value="efectivo_dolares">Efectivo dólares</option>
              <option value="transferencia_bancaria">Transferencia bancaria (BAC/Lafise/Banpro)</option>
              <option value="tarjeta">Tarjeta débito/crédito</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          {isUsd ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pay-usd" className="text-xs font-bold text-ink-muted block mb-1">Monto recibido (US$) *</label>
                <input
                  id="pay-usd"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(parseFloat(e.target.value) || 0)}
                  className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-sm font-bold tabular-nums focus:outline-none focus:border-moss"
                />
              </div>
              <div>
                <label htmlFor="pay-rate" className="text-xs font-bold text-ink-muted block mb-1">Tasa aplicada (C$ por US$)</label>
                <input
                  id="pay-rate"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  required
                  value={rateApplied}
                  onChange={(e) => setRateApplied(parseFloat(e.target.value) || 0)}
                  className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-moss"
                />
              </div>
              <p className="col-span-2 text-xs text-ink-muted">
                Equivale a <strong className="text-ink tabular-nums">{formatNIO(effectiveAmountNio)}</strong>
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="pay-nio" className="text-xs font-bold text-ink-muted block mb-1">Monto del abono (C$) *</label>
              <input
                id="pay-nio"
                type="number"
                step="0.01"
                min="0.01"
                max={selectedInvoice?.balanceDueNio || undefined}
                required
                value={paymentAmountNio}
                onChange={(e) => setPaymentAmountNio(parseFloat(e.target.value) || 0)}
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-sm text-ink font-bold tabular-nums focus:outline-none focus:border-moss"
              />
            </div>
          )}
          {exceedsBalance && (
            <p role="alert" className="text-xs font-semibold text-rose-700">
              El abono supera el saldo pendiente ({formatNIO(selectedInvoice?.balanceDueNio || 0)}).
            </p>
          )}

          <div>
            <label htmlFor="pay-ref" className="text-xs font-bold text-ink-muted block mb-1"># Referencia bancaria</label>
            <input
              id="pay-ref"
              type="text"
              placeholder="BAC-9482..."
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-sm text-ink"
            />
            <p className="text-[11px] text-ink-muted mt-1">El número de recibo (REC-) lo asigna el sistema.</p>
          </div>

          <div>
            <label className="text-[11px] font-bold text-ink-muted block mb-1">Notas del Abono</label>
            <input
              type="text"
              placeholder="Ej: Abono 2 de 3 acordado en quincena"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink"
            />
          </div>

          <div className="pt-4 border-t border-moss/10 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || exceedsBalance || effectiveAmountNio <= 0}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-moss hover:bg-moss-700 disabled:opacity-50 text-white shadow-md shadow-moss/20"
            >
              {saving ? 'Registrando…' : `Registrar abono de ${formatNIO(effectiveAmountNio)}`}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Historial de Abonos */}
      <Modal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        title={`Historial de Abonos: Factura ${selectedInvoice?.invoiceNumber}`}
        subtitle={`Cliente: ${selectedInvoice?.customerName} | Total: ${formatNIO(selectedInvoice?.totalNio || 0)}`}
        maxWidth="lg"
      >
        <div className="space-y-3">
          {selectedInvoice?.payments && selectedInvoice.payments.length > 0 ? (
            selectedInvoice.payments.map((p, idx) => (
              <div key={p.id || idx} className="bg-surface p-3 rounded-xl border border-moss/15 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-moss-800">{formatNIO(p.amountNio)}</span>
                    <span className="text-ink-muted">&bull; {p.paymentMethod.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-[11px] text-ink-muted mt-0.5 font-mono">
                    Recibo: {p.receiptNumber} {p.referenceNumber && `| Ref: ${p.referenceNumber}`}
                    {p.amountUsd ? ` | US$ ${p.amountUsd.toFixed(2)} a ${p.exchangeRateApplied?.toFixed(2) ?? '—'}` : ''}
                  </p>
                  {p.notes && <p className="text-[11px] text-ink mt-0.5">{p.notes}</p>}
                </div>
                <span className="text-[10px] text-ink-muted font-mono">
                  {new Date(p.paymentDate).toLocaleDateString('es-NI')}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-ink-muted text-center py-4">No hay abonos registrados para esta factura.</p>
          )}
          {(selectedInvoice?.creditNotes || []).map((cn) => (
            <div key={cn.id} className="bg-sky-50 p-3 rounded-xl border border-sky-200 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-sky-900">Nota de crédito {cn.creditNoteNumber}: {formatNIO(cn.amountNio)}</span>
                <p className="text-[11px] text-sky-800 mt-0.5">{cn.reason}</p>
              </div>
              {cn.createdAt && (
                <span className="text-[10px] text-ink-muted font-mono">{new Date(cn.createdAt).toLocaleDateString('es-NI')}</span>
              )}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
