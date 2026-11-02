'use client';

import React from 'react';
import { Receipt, CreditCard, Truck } from 'lucide-react';
import { SalesInvoice } from '@/domain/sales/types';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';

interface SalesStatsCardsProps {
  invoices: SalesInvoice[];
}

export function SalesStatsCards({ invoices }: SalesStatsCardsProps) {
  const activeInvoices = invoices.filter((i) => i.status !== 'anulada');

  const totalInvoiced = activeInvoices.reduce((acc, i) => acc + (i.totalNio || 0), 0);
  const totalReceivables = activeInvoices.reduce((acc, i) => acc + (i.balanceDueNio || 0), 0);
  const pendingDeliveries = activeInvoices.filter(
    (i) => i.deliveryStatus !== 'entregado' && i.deliveryStatus !== 'cancelado'
  ).length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="erp-card p-4 flex items-center gap-4 bg-white border border-moss/15 rounded-2xl">
        <div className="w-10 h-10 rounded-xl bg-moss/10 text-moss flex items-center justify-center shrink-0">
          <Receipt className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[11px] text-ink-muted font-bold block uppercase tracking-wider">
            Total Facturado
          </span>
          <h3 className="text-lg font-extrabold text-ink leading-tight">
            {formatNIO(totalInvoiced)}
          </h3>
          <span className="text-[10px] text-ink-muted">
            {activeInvoices.length} facturas emitidas
          </span>
        </div>
      </div>

      <div className="erp-card p-4 flex items-center gap-4 bg-white border border-moss/15 rounded-2xl">
        <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0">
          <CreditCard className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[11px] text-ink-muted font-bold block uppercase tracking-wider">
            Saldo por Cobrar
          </span>
          <h3 className="text-lg font-extrabold text-sky-700 leading-tight">
            {formatNIO(totalReceivables)}
          </h3>
          <span className="text-[10px] text-ink-muted">Pendiente de amortización</span>
        </div>
      </div>

      <div className="erp-card p-4 flex items-center gap-4 bg-white border border-moss/15 rounded-2xl">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
          <Truck className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[11px] text-ink-muted font-bold block uppercase tracking-wider">
            Despachos Pendientes
          </span>
          <h3 className="text-lg font-extrabold text-amber-800 leading-tight">
            {pendingDeliveries} pedidos
          </h3>
          <span className="text-[10px] text-ink-muted">En tránsito o listos</span>
        </div>
      </div>
    </div>
  );
}
