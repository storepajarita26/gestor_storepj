'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, BellRing, ScanBarcode, Save, Receipt } from 'lucide-react';
import { Modal } from '@/presentation/components/ui/Modal';
import { StatusBadge } from '@/presentation/components/ui/StatusBadge';
import { Customer, SalesInvoice } from '@/domain/sales/types';
import { getDaysOverdue, getDueDate, isReceivable, summarizeCustomer } from '@/domain/sales/services/customerService';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { buildReminderMessage, normalizeWhatsappPhone, openWhatsapp } from '@/domain/shared/utils/whatsapp';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { useToast } from '@/presentation/components/ui/Toast';

interface CustomerDetailModalProps {
  customer: Customer | null;
  /** true para dar de alta un cliente nuevo */
  isNew?: boolean;
  invoices: SalesInvoice[];
  onClose: () => void;
}

const EMPTY: Customer = { id: '', fullName: '', city: 'Managua' };

function formatDate(iso?: string) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Ficha del cliente: datos editables, resumen, tallas preferidas, historial y cobro por WhatsApp */
export function CustomerDetailModal({ customer, isNew = false, invoices, onClose }: CustomerDetailModalProps) {
  const toast = useToast();
  const [form, setForm] = useState<Customer>(EMPTY);
  const [saving, setSaving] = useState(false);
  const creditDays = dataStore.getDefaultCreditDays();
  const isOpen = Boolean(customer) || isNew;

  useEffect(() => {
    setForm(customer ? { ...customer } : { ...EMPTY });
  }, [customer?.id, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(
    () => (customer ? summarizeCustomer(customer, invoices, creditDays) : null),
    [customer, invoices, creditDays]
  );
  const pendingInvoices = (summary?.invoices || []).filter(isReceivable);
  const dirty =
    !customer ||
    (['fullName', 'phoneWhatsapp', 'identificationNumber', 'city', 'address', 'notes'] as const).some(
      (k) => (form[k] || '') !== (customer[k] || '')
    );
  const phoneValid = !form.phoneWhatsapp || normalizeWhatsappPhone(form.phoneWhatsapp) !== null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !phoneValid) return;
    setSaving(true);
    if (isNew || !customer) {
      const created = dataStore.addCustomer({
        fullName: form.fullName.trim(),
        phoneWhatsapp: form.phoneWhatsapp?.trim() || undefined,
        identificationNumber: form.identificationNumber?.trim() || undefined,
        city: form.city?.trim() || 'Managua',
        address: form.address?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
      });
      toast.success(`Cliente "${created.fullName}" registrado.`);
      setSaving(false);
      onClose();
      return;
    }
    const res = await dataStore.updateCustomer({
      ...customer,
      ...form,
      phoneWhatsapp: form.phoneWhatsapp?.trim() || undefined,
      identificationNumber: form.identificationNumber?.trim() || undefined,
      address: form.address?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
    });
    setSaving(false);
    if (!res.success) toast.error(res.message, 'No se guardó');
    else if (res.sync === 'pending') toast.warning(res.message, 'Guardado en este equipo');
    else toast.success(res.message);
  };

  const sendReminder = () => {
    if (!customer) return;
    const storeName = dataStore.getStoreSettings().storeName || 'Pajarita Store';
    openWhatsapp(
      customer.phoneWhatsapp,
      buildReminderMessage(
        customer.fullName,
        storeName,
        pendingInvoices.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          balanceDueNio: inv.balanceDueNio,
          dueDate: getDueDate(inv, creditDays).date,
          daysOverdue: getDaysOverdue(inv, creditDays),
        }))
      )
    );
  };

  const field = (key: keyof Customer, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`cust-${key}`} className="block text-xs font-bold text-ink-muted mb-1">
        {label}
      </label>
      <input
        id={`cust-${key}`}
        value={(form[key] as string) || ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full border border-moss/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-moss/30"
        {...props}
      />
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isNew ? 'Nuevo cliente' : customer?.fullName || 'Cliente'}
      subtitle={isNew ? 'Solo el nombre es obligatorio' : customer?.phoneWhatsapp || 'Sin teléfono'}
      maxWidth="3xl"
    >
      <div className="space-y-6">
        {summary && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Compras', value: String(summary.purchasesCount) },
                { label: 'Total comprado', value: formatNIO(summary.totalPurchasedNio) },
                { label: 'Saldo pendiente', value: formatNIO(summary.balanceDueNio), tone: summary.balanceDueNio > 0 ? 'text-amber-700' : '' },
                {
                  label: 'Vencido',
                  value: summary.overdueNio > 0 ? `${formatNIO(summary.overdueNio)}` : '—',
                  hint: summary.overdueNio > 0 ? `hasta ${summary.maxDaysOverdue} días` : undefined,
                  tone: summary.overdueNio > 0 ? 'text-rose-700' : '',
                },
              ].map((k) => (
                <div key={k.label} className="rounded-xl bg-surface p-3">
                  <p className="text-xs text-ink-muted">{k.label}</p>
                  <p className={`text-lg font-bold tabular-nums ${k.tone || 'text-ink'}`}>{k.value}</p>
                  {k.hint && <p className="text-xs text-rose-700">{k.hint}</p>}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/vender?cliente=${customer!.id}`}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-moss hover:bg-moss-700 text-white text-sm font-bold"
              >
                <ScanBarcode className="w-4 h-4" aria-hidden="true" /> Vender a este cliente
              </Link>
              <button
                type="button"
                onClick={() => openWhatsapp(customer!.phoneWhatsapp, `¡Hola ${customer!.fullName.split(' ')[0]}! `)}
                disabled={!customer!.phoneWhatsapp}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-emerald-300 text-emerald-800 hover:bg-emerald-50 text-sm font-bold disabled:opacity-40"
              >
                <MessageCircle className="w-4 h-4" aria-hidden="true" /> WhatsApp
              </button>
              {summary.balanceDueNio > 0 && (
                <button
                  type="button"
                  onClick={sendReminder}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-amber-300 text-amber-900 hover:bg-amber-50 text-sm font-bold"
                >
                  <BellRing className="w-4 h-4" aria-hidden="true" /> Recordar saldo
                </button>
              )}
            </div>

            {(summary.topSizes.length > 0 || summary.topColors.length > 0) && (
              <div className="text-sm">
                <p className="text-xs font-bold text-ink-muted uppercase tracking-wide mb-1.5">Lo que más compra</p>
                <div className="flex flex-wrap gap-1.5">
                  {summary.topSizes.map((s) => (
                    <span key={`s-${s.label}`} className="px-2 py-0.5 rounded-lg bg-moss/10 text-moss font-semibold">
                      Talla {s.label} · {s.units}
                    </span>
                  ))}
                  {summary.topColors.map((c) => (
                    <span key={`c-${c.label}`} className="px-2 py-0.5 rounded-lg bg-surface text-ink font-semibold">
                      {c.label} · {c.units}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <form onSubmit={handleSave} className="space-y-3">
          <p className="text-xs font-bold text-ink-muted uppercase tracking-wide">Datos</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {field('fullName', 'Nombre *', { required: true, autoFocus: isNew })}
            <div>
              {field('phoneWhatsapp', 'WhatsApp', { inputMode: 'tel', placeholder: '8888 8888' })}
              {!phoneValid && <p className="text-xs text-rose-700 mt-1">Revise el número (8 dígitos o con código de país).</p>}
            </div>
            {field('identificationNumber', 'Cédula / RUC', { placeholder: '001-000000-0000A' })}
            {field('city', 'Ciudad')}
            <div className="sm:col-span-2">{field('address', 'Dirección de entrega')}</div>
            <div className="sm:col-span-2">{field('notes', 'Notas (tallas, preferencias, referencias)')}</div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !dirty || !form.fullName.trim() || !phoneValid}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-moss hover:bg-moss-700 text-white text-sm font-bold disabled:opacity-40"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              {saving ? 'Guardando…' : isNew ? 'Registrar cliente' : 'Guardar cambios'}
            </button>
          </div>
        </form>

        {summary && (
          <div>
            <p className="text-xs font-bold text-ink-muted uppercase tracking-wide mb-2">Historial ({summary.invoices.length})</p>
            {summary.invoices.length === 0 ? (
              <p className="text-sm text-ink-muted">Todavía no tiene compras.</p>
            ) : (
              <div className="overflow-x-auto border border-moss/10 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-surface text-xs text-ink-muted">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Factura</th>
                      <th className="text-left px-3 py-2 font-semibold">Fecha</th>
                      <th className="text-right px-3 py-2 font-semibold">Total</th>
                      <th className="text-right px-3 py-2 font-semibold">Saldo</th>
                      <th className="text-left px-3 py-2 font-semibold">Vence</th>
                      <th className="text-left px-3 py-2 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.invoices.map((inv) => {
                      const receivable = isReceivable(inv);
                      const days = receivable ? getDaysOverdue(inv, creditDays) : 0;
                      const due = getDueDate(inv, creditDays);
                      return (
                        <tr key={inv.id} className="border-t border-moss/10">
                          <td className="px-3 py-2">
                            <Link href={`/ventas?factura=${inv.id}`} className="font-mono font-semibold text-moss hover:underline inline-flex items-center gap-1">
                              <Receipt className="w-3.5 h-3.5" aria-hidden="true" />
                              {inv.invoiceNumber}
                            </Link>
                          </td>
                          <td className="px-3 py-2 tabular-nums">{formatDate(inv.issueDate)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatNIO(inv.totalNio)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${receivable ? 'font-bold text-amber-700' : 'text-ink-muted'}`}>
                            {receivable ? formatNIO(inv.balanceDueNio) : '—'}
                          </td>
                          <td className={`px-3 py-2 tabular-nums ${days > 0 ? 'text-rose-700 font-semibold' : ''}`}>
                            {receivable ? `${formatDate(due.date)}${due.estimated ? '*' : ''}${days > 0 ? ` (${days} d)` : ''}` : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={inv.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {pendingInvoices.some((inv) => getDueDate(inv, creditDays).estimated) && (
              <p className="text-xs text-ink-muted mt-1">* Vencimiento estimado ({creditDays} días desde la emisión): la factura no tiene fecha de vencimiento.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
