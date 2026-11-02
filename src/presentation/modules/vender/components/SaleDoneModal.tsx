'use client';

import React, { useEffect, useRef } from 'react';
import { CheckCircle2, MessageCircle, Printer, Plus, CloudOff } from 'lucide-react';
import { Modal } from '@/presentation/components/ui/Modal';
import { InvoicePdfView } from '@/presentation/components/invoice/InvoicePdfView';
import { SalesInvoice } from '@/domain/sales/types';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { buildInvoiceMessage, openWhatsapp } from '@/domain/shared/utils/whatsapp';
import { dataStore } from '@/infrastructure/repositories/dataStore';

interface SaleDoneModalProps {
  invoice: SalesInvoice | null;
  onNewSale: () => void;
}

/** Después de cobrar: imprimir, enviar por WhatsApp o seguir con la siguiente venta (Enter) */
export function SaleDoneModal({ invoice, onNewSale }: SaleDoneModalProps) {
  const newSaleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (invoice) setTimeout(() => newSaleRef.current?.focus(), 50);
  }, [invoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!invoice) return null;
  const storeName = dataStore.getStoreSettings().storeName || 'Pajarita Store';
  const pending = Boolean(invoice.syncOpId);
  const balance = invoice.balanceDueNio || 0;

  return (
    <Modal isOpen onClose={onNewSale} title="Venta registrada" maxWidth="3xl">
      <div className="p-5 border-b border-moss/10 bg-emerald-50/60 print:hidden">
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" aria-hidden="true" />
            <div>
              <p className="text-lg font-black text-ink">
                {invoice.invoiceNumber} · {formatNIO(invoice.totalNio)}
              </p>
              <p className="text-sm text-ink-muted">
                {invoice.customerName}
                {balance > 0.009 ? ` · saldo ${formatNIO(balance)}${invoice.dueDate ? `, vence ${invoice.dueDate}` : ''}` : ' · pagada'}
              </p>
              {pending && (
                <p className="text-xs text-amber-700 font-semibold flex items-center gap-1 mt-0.5">
                  <CloudOff className="w-3.5 h-3.5" aria-hidden="true" /> Número provisional: se confirma al sincronizar
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openWhatsapp(invoice.customerPhone, buildInvoiceMessage(invoice, storeName))}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
            >
              <MessageCircle className="w-4 h-4" aria-hidden="true" /> WhatsApp
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-moss/20 bg-white hover:bg-surface text-ink text-sm font-bold"
            >
              <Printer className="w-4 h-4" aria-hidden="true" /> Imprimir
            </button>
            <button
              ref={newSaleRef}
              type="button"
              onClick={onNewSale}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-moss hover:bg-moss-700 text-white text-sm font-bold"
            >
              <Plus className="w-4 h-4" aria-hidden="true" /> Nueva venta
              <kbd className="text-[10px] bg-white/15 rounded px-1.5 py-0.5">Enter</kbd>
            </button>
          </div>
        </div>
      </div>
      <InvoicePdfView invoice={invoice} showToolbar={false} />
    </Modal>
  );
}
