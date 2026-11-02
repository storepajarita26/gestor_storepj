'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Boxes,
  Warehouse,
  Truck,
  TrendingUp,
  CreditCard,
  PlusCircle,
  PackageSearch,
  Receipt,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import { StatCard } from '@/presentation/components/ui/StatCard';
import { StatusBadge } from '@/presentation/components/ui/StatusBadge';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { calculateDashboardKpis } from '@/domain/analytics/services/kpiCalculator';
import { formatNIO, formatUSD } from '@/domain/shared/utils/currencyFormatter';
import { DashboardKpis } from '@/domain/analytics/types';
import { PurchaseOrder } from '@/domain/procurement/types';
import { SalesInvoice } from '@/domain/sales/types';

export function DashboardView() {
  const [kpis, setKpis] = useState<DashboardKpis>({
    totalActiveSkus: 0,
    totalInventoryCostNio: 0,
    totalInventorySaleValueNio: 0,
    capitalInTransitUsd: 0,
    capitalInTransitNio: 0,
    ordersInTransitCount: 0,
    monthlySalesNio: 0,
    monthlyGrossProfitNio: 0,
    totalReceivablesNio: 0,
    pendingInvoicesCount: 0,
  });

  const [transitOrders, setTransitOrders] = useState<PurchaseOrder[]>([]);
  const [pendingCredits, setPendingCredits] = useState<SalesInvoice[]>([]);

  const refreshData = () => {
    const skus = dataStore.getAllSkus();
    const stocks = dataStore.getStock();
    const orders = dataStore.getPurchaseOrders();
    const invoices = dataStore.getInvoices();
    const rate = dataStore.getExchangeRate();

    const calculated = calculateDashboardKpis(skus, stocks, orders, invoices, rate, undefined, dataStore.getTaxRegime());
    setKpis(calculated);

    const inTransit = orders.filter((o) =>
      ['comprado', 'en_agencia_envio', 'en_transito_nicaragua'].includes(o.status)
    );
    setTransitOrders(inTransit);

    const credits = invoices.filter((i) => i.balanceDueNio > 0 && i.status !== 'anulada');
    setPendingCredits(credits);
  };

  // Saludo y fecha de este equipo (se calculan al montar para no diferir del servidor)
  const [greeting, setGreeting] = useState({ title: '', date: '' });
  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    setGreeting({
      title: h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches',
      date: now.toLocaleDateString('es-NI', { weekday: 'long', day: 'numeric', month: 'long' }),
    });
  }, []);

  useEffect(() => {
    refreshData();
    const unsub = dataStore.subscribe(refreshData);
    return unsub;
  }, []);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Banner / Welcome */}
      <div className="erp-card p-6 bg-gradient-to-r from-surface-soft via-white to-eggshell-100 border border-moss/15 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-ink tracking-tight">{greeting.title || 'Hola'}</h2>
            <p className="text-ink-muted text-sm mt-1 first-letter:uppercase">{greeting.date}&nbsp;</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/vender"
              className="flex items-center gap-2 bg-moss hover:bg-moss-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-moss/20"
            >
              <Receipt className="w-4 h-4 text-mustard" />
              <span>Vender</span>
            </Link>
            <Link
              href="/compras"
              className="flex items-center gap-2 bg-surface hover:bg-eggshell-100 text-ink border border-moss/20 text-sm font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm"
            >
              <PlusCircle className="w-4 h-4 text-moss" />
              <span>Nueva compra</span>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="SKUs Activos en Catálogo"
          value={kpis.totalActiveSkus}
          subtitle="Variantes disponibles para venta"
          icon={Boxes}
          accentColor="moss"
        />

        <StatCard
          title="Dinero en Inventario (Costo)"
          value={formatNIO(kpis.totalInventoryCostNio)}
          subtitle={`Venta est: ${formatNIO(kpis.totalInventorySaleValueNio)}`}
          icon={Warehouse}
          accentColor="emerald"
        />

        <StatCard
          title="Capital en Tránsito (Shein / USA)"
          value={formatNIO(kpis.capitalInTransitNio)}
          subtitle={`${kpis.ordersInTransitCount} lotes (${formatUSD(kpis.capitalInTransitUsd)})`}
          icon={Truck}
          accentColor="mustard"
        />

        <StatCard
          title="Cuentas por Cobrar (Créditos)"
          value={formatNIO(kpis.totalReceivablesNio)}
          subtitle={`${kpis.pendingInvoicesCount} facturas con saldo pendiente`}
          icon={CreditCard}
          accentColor="amber"
        />
      </div>

      {/* Secondary Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="erp-card p-5">
          <div className="flex items-center justify-between pb-3 border-b border-moss/10">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-moss" />
              <h3 className="font-bold text-sm text-ink">Rendimiento Comercial del Mes</h3>
            </div>
            <span className="text-[11px] font-bold text-moss bg-moss/10 px-2 py-0.5 rounded-full border border-moss/20">
              En Vivo
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-surface p-4 rounded-xl border border-moss/10">
              <p className="text-xs text-ink-muted font-medium">Ventas Totales Brutas</p>
              <p className="text-xl font-bold text-ink mt-1">
                {formatNIO(kpis.monthlySalesNio)}
              </p>
            </div>
            <div className="bg-surface p-4 rounded-xl border border-moss/10">
              <p className="text-xs text-ink-muted font-medium">Margen Bruto Estimado</p>
              <p className="text-xl font-bold text-moss-700 mt-1">
                {formatNIO(kpis.monthlyGrossProfitNio)}
              </p>
            </div>
          </div>
        </div>

        <div className="erp-card p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-moss/10">
            <div className="flex items-center gap-2">
              <PackageSearch className="w-4 h-4 text-moss" />
              <h3 className="font-bold text-sm text-ink">Acceso Rápido Operativo</h3>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <Link
              href="/recepciones"
              className="p-3 bg-surface hover:bg-surface-soft border border-moss/10 rounded-xl flex flex-col items-center justify-center text-center transition-all group shadow-xs"
            >
              <PackageSearch className="w-5 h-5 text-moss group-hover:scale-110 transition-transform mb-1.5" />
              <span className="text-xs font-bold text-ink">Recepción</span>
              <span className="text-[10px] text-ink-muted">Inspección</span>
            </Link>

            <Link
              href="/inventario"
              className="p-3 bg-surface hover:bg-surface-soft border border-moss/10 rounded-xl flex flex-col items-center justify-center text-center transition-all group shadow-xs"
            >
              <Warehouse className="w-5 h-5 text-moss-700 group-hover:scale-110 transition-transform mb-1.5" />
              <span className="text-xs font-bold text-ink">Desempaque</span>
              <span className="text-[10px] text-ink-muted">Packs a Unid.</span>
            </Link>

            <Link
              href="/creditos"
              className="p-3 bg-surface hover:bg-surface-soft border border-moss/10 rounded-xl flex flex-col items-center justify-center text-center transition-all group shadow-xs"
            >
              <CreditCard className="w-5 h-5 text-amber-700 group-hover:scale-110 transition-transform mb-1.5" />
              <span className="text-xs font-bold text-ink">Abonos</span>
              <span className="text-[10px] text-ink-muted">Cobranza</span>
            </Link>
          </div>
        </div>
      </div>

      {/* In-Transit Orders & Pending Credits Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lotes en Tránsito */}
        <div className="erp-card p-5">
          <div className="flex items-center justify-between pb-4 border-b border-moss/10">
            <div>
              <h3 className="font-bold text-sm text-ink">Órdenes de Compra en Tránsito</h3>
              <p className="text-xs text-ink-muted">Seguimiento por Tracking Shein / Amazon</p>
            </div>
            <Link
              href="/compras"
              className="text-xs text-moss hover:text-moss-800 flex items-center gap-1 font-bold"
            >
              <span>Ver todas</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-moss/10 mt-2">
            {transitOrders.length === 0 ? (
              <p className="text-xs text-ink-muted py-6 text-center">No hay órdenes en tránsito actualmente.</p>
            ) : (
              transitOrders.map((order) => (
                <div key={order.id} className="py-3.5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-ink">{order.orderNumber}</span>
                      <span className="text-[11px] text-ink-muted">({order.supplierName})</span>
                    </div>
                    <p className="text-[11px] text-ink-muted font-mono mt-0.5">
                      Guía: {order.trackingNumber || 'Sin tracking'}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={order.status} />
                    <p className="text-xs font-bold text-ink mt-1">
                      {formatNIO(order.totalCostNio + (order.totalImportExpensesNio || 0))}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Facturas con Saldo Pendiente */}
        <div className="erp-card p-5">
          <div className="flex items-center justify-between pb-4 border-b border-moss/10">
            <div>
              <h3 className="font-bold text-sm text-ink">Cuentas por Cobrar Pendientes</h3>
              <p className="text-xs text-ink-muted">Seguimiento de abonos de clientes</p>
            </div>
            <Link
              href="/creditos"
              className="text-xs text-moss hover:text-moss-800 flex items-center gap-1 font-bold"
            >
              <span>Gestionar cobros</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-moss/10 mt-2">
            {pendingCredits.length === 0 ? (
              <p className="text-xs text-ink-muted py-6 text-center">Todas las cuentas al día.</p>
            ) : (
              pendingCredits.map((inv) => (
                <div key={inv.id} className="py-3.5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-ink">{inv.invoiceNumber}</span>
                      <span className="text-[11px] text-ink-muted">{inv.customerName}</span>
                    </div>
                    <p className="text-[11px] text-ink-muted mt-0.5">
                      Abonado: {formatNIO(inv.amountPaidNio)} de {formatNIO(inv.totalNio)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-amber-700">
                      Resta: {formatNIO(inv.balanceDueNio)}
                    </p>
                    <span className="text-[10px] text-ink-muted">
                      {inv.payments.length} abonos registrados
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
