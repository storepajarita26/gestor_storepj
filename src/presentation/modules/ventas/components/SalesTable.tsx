'use client';

import React from 'react';
import { FileText, Truck, AlertCircle, Ban, Undo2, CloudOff, MessageCircle } from 'lucide-react';
import { buildInvoiceMessage, openWhatsapp } from '@/domain/shared/utils/whatsapp';
import { SalesInvoice } from '@/domain/sales/types';
import { StatusBadge } from '@/presentation/components/ui/StatusBadge';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { Pagination } from '@/presentation/components/ui/Pagination';
import { dataStore } from '@/infrastructure/repositories/dataStore';

interface SalesTableProps {
  invoices: SalesInvoice[];
  totalInvoices: number;
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (items: number) => void;
  onViewPdf: (invoice: SalesInvoice) => void;
  onUpdateDelivery: (invoice: SalesInvoice) => void;
  onVoid?: (invoice: SalesInvoice) => void;
  onReturn?: (invoice: SalesInvoice) => void;
}

export function SalesTable({
  invoices,
  totalInvoices,
  currentPage,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  onViewPdf,
  onUpdateDelivery,
  onVoid,
  onReturn,
}: SalesTableProps) {
  const totalPages = Math.ceil(totalInvoices / itemsPerPage) || 1;
  // En régimen de cuota fija no se muestran columnas de subtotal sin IVA ni IVA
  const showIvaColumns = dataStore.getIvaRate() > 0;
  // Estado del reintento de sincronización por factura (para mostrar el motivo real si falla)
  const [syncing, setSyncing] = React.useState<Record<string, boolean>>({});
  const [syncMsg, setSyncMsg] = React.useState<Record<string, { ok: boolean; text: string }>>({});

  const handleRetrySync = async (invoiceId: string) => {
    setSyncing((s) => ({ ...s, [invoiceId]: true }));
    setSyncMsg((m) => { const { [invoiceId]: _, ...rest } = m; return rest; });
    try {
      const res = await dataStore.retryInvoiceSync(invoiceId);
      setSyncMsg((m) => ({ ...m, [invoiceId]: { ok: res.sync === 'synced', text: res.message } }));
    } catch (e) {
      setSyncMsg((m) => ({ ...m, [invoiceId]: { ok: false, text: (e as Error).message } }));
    } finally {
      setSyncing((s) => ({ ...s, [invoiceId]: false }));
    }
  };

  if (invoices.length === 0) {
    return (
      <div className="erp-card p-10 text-center bg-white border border-moss/15 rounded-2xl">
        <AlertCircle className="w-8 h-8 text-ink-muted mx-auto mb-2 opacity-60" />
        <h3 className="text-sm font-bold text-ink">No se encontraron facturas</h3>
        <p className="text-xs text-ink-muted mt-1">
          No hay registros que coincidan con la búsqueda o el filtro de entrega seleccionado.
        </p>
      </div>
    );
  }

  return (
    <div className="erp-card rounded-2xl overflow-hidden border border-moss/15 bg-white shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-surface-soft border-b border-moss/10 text-ink-muted uppercase tracking-wider text-[10px] font-bold">
              <th className="py-3 px-4">Factura & Fecha</th>
              <th className="py-3 px-4">Cliente / Contacto</th>
              <th className="py-3 px-4">Tipo & Pago</th>
              {showIvaColumns && <th className="py-3 px-4 text-right">Subtotal</th>}
              {showIvaColumns && <th className="py-3 px-4 text-right">IVA (15%)</th>}
              <th className="py-3 px-4 text-right font-bold text-ink">Total Factura</th>
              <th className="py-3 px-4 text-right">Saldo Pendiente</th>
              <th className="py-3 px-4 text-center">Estado Pago</th>
              <th className="py-3 px-4 text-center">Despacho</th>
              <th className="py-3 px-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-moss/10">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-surface/60 transition-colors">
                {/* Invoice Number & Date */}
                <td className="py-3 px-4">
                  <div className="font-mono font-bold text-moss">{inv.invoiceNumber}</div>
                  <div className="text-[10px] text-ink-muted">{inv.issueDate}</div>
                  {inv.syncOpId && (
                    <button
                      type="button"
                      disabled={syncing[inv.id]}
                      onClick={() => handleRetrySync(inv.id)}
                      className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-1.5 py-0.5 rounded transition-colors disabled:opacity-60 disabled:cursor-wait"
                      title="Haz clic para sincronizar ahora con la nube (requiere sesión iniciada)"
                    >
                      <CloudOff className="w-3 h-3" aria-hidden="true" />
                      <span>{syncing[inv.id] ? 'Sincronizando…' : 'Sin sincronizar (Sincronizar)'}</span>
                    </button>
                  )}
                  {syncMsg[inv.id] && (
                    <div
                      className={`mt-0.5 text-[10px] max-w-[220px] leading-snug ${syncMsg[inv.id].ok ? 'text-emerald-700' : 'text-rose-700'}`}
                      role="status"
                    >
                      {syncMsg[inv.id].text}
                    </div>
                  )}
                  {inv.status === 'anulada' && inv.voidReason && (
                    <div className="mt-0.5 text-[10px] text-rose-700 max-w-[160px] truncate" title={inv.voidReason}>
                      Anulada: {inv.voidReason}
                    </div>
                  )}
                </td>

                {/* Customer */}
                <td className="py-3 px-4">
                  <div className="font-bold text-ink leading-tight">
                    {inv.customerName || 'Cliente General'}
                  </div>
                  {inv.customerPhone && (
                    <div className="text-[10px] text-ink-muted font-mono">{inv.customerPhone}</div>
                  )}
                </td>

                {/* Sale Type & Term */}
                <td className="py-3 px-4">
                  <span
                    className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      inv.saleType === 'pedido'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {inv.saleType === 'pedido' ? 'Bajo Pedido' : 'Inmediata'}
                  </span>
                  <div className="text-[10px] text-ink-muted font-semibold mt-0.5">
                    {inv.paymentTerm === 'credito' ? 'Crédito' : 'Contado'}
                  </div>
                </td>

                {/* Subtotal e IVA (solo régimen general) */}
                {showIvaColumns && (
                  <td className="py-3 px-4 text-right font-mono text-ink-muted">
                    {formatNIO(inv.subtotalSinIvaNio || 0)}
                  </td>
                )}
                {showIvaColumns && (
                  <td className="py-3 px-4 text-right font-mono text-ink-muted">
                    {formatNIO(inv.ivaTotalNio || 0)}
                  </td>
                )}

                {/* Total */}
                <td className="py-3 px-4 text-right font-mono font-extrabold text-moss">
                  {formatNIO(inv.totalNio || 0)}
                </td>

                {/* Balance Due */}
                <td className="py-3 px-4 text-right font-mono">
                  {inv.balanceDueNio > 0 ? (
                    <span className="font-bold text-rose-600">
                      {formatNIO(inv.balanceDueNio)}
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-semibold">C$ 0.00</span>
                  )}
                </td>

                {/* Payment Status */}
                <td className="py-3 px-4 text-center">
                  <StatusBadge status={inv.status} />
                </td>

                {/* Delivery Status */}
                <td className="py-3 px-4 text-center">
                  <StatusBadge status={inv.deliveryStatus || 'entregado'} />
                  {inv.trackingRef && (
                    <div className="text-[9px] text-ink-muted font-mono truncate max-w-[90px] mx-auto mt-0.5">
                      {inv.trackingRef}
                    </div>
                  )}
                </td>

                {/* Actions */}
                <td className="py-3 px-4 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => onViewPdf(inv)}
                      className="p-1.5 rounded-lg bg-surface hover:bg-moss/10 text-moss transition-colors"
                      title="Ver e imprimir PDF de factura fiscal"
                    >
                      <FileText className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => openWhatsapp(inv.customerPhone, buildInvoiceMessage(inv, dataStore.getStoreSettings().storeName || 'Pajarita Store'))}
                      className="p-1.5 rounded-lg bg-surface hover:bg-emerald-100 text-emerald-700 transition-colors"
                      title={inv.customerPhone ? `Enviar por WhatsApp a ${inv.customerPhone}` : 'Enviar por WhatsApp'}
                      aria-label={`Enviar ${inv.invoiceNumber} por WhatsApp`}
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>

                    {inv.status !== 'anulada' && (
                      <button
                        onClick={() => onUpdateDelivery(inv)}
                        className="p-1.5 rounded-lg bg-surface hover:bg-amber-100 text-amber-800 transition-colors"
                        title="Actualizar estado de entrega o despacho"
                        aria-label={`Actualizar entrega de ${inv.invoiceNumber}`}
                      >
                        <Truck className="w-4 h-4" />
                      </button>
                    )}

                    {onReturn && inv.status !== 'anulada' && (Boolean(inv.dispatchedAt) || inv.saleType === 'normal') && (
                      <button
                        onClick={() => onReturn(inv)}
                        className="p-1.5 rounded-lg bg-surface hover:bg-sky-100 text-sky-800 transition-colors"
                        title="Registrar devolución (nota de crédito)"
                        aria-label={`Devolución en ${inv.invoiceNumber}`}
                      >
                        <Undo2 className="w-4 h-4" />
                      </button>
                    )}

                    {onVoid && inv.status !== 'anulada' && (
                      <button
                        onClick={() => onVoid(inv)}
                        className="p-1.5 rounded-lg bg-surface hover:bg-rose-100 text-rose-700 transition-colors"
                        title="Anular factura"
                        aria-label={`Anular ${inv.invoiceNumber}`}
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalInvoices}
        itemsPerPage={itemsPerPage}
        onPageChange={onPageChange}
        onItemsPerPageChange={onItemsPerPageChange}
      />
    </div>
  );
}
