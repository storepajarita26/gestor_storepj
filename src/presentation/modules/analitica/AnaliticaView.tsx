'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
} from 'lucide-react';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { calculateDashboardKpis } from '@/domain/analytics/services/kpiCalculator';
import { DashboardKpis } from '@/domain/analytics/types';

export function AnaliticaView() {
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

  const refreshData = () => {
    const skus = dataStore.getAllSkus();
    const stocks = dataStore.getStock();
    const orders = dataStore.getPurchaseOrders();
    const invoices = dataStore.getInvoices();
    const rate = dataStore.getExchangeRate();
    setKpis(calculateDashboardKpis(skus, stocks, orders, invoices, rate));
  };

  useEffect(() => {
    refreshData();
    const unsub = dataStore.subscribe(refreshData);
    return unsub;
  }, []);

  const profitMarginPercent = kpis.monthlySalesNio > 0
    ? Math.round((kpis.monthlyGrossProfitNio / kpis.monthlySalesNio) * 100)
    : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-moss" />
          Analítica Operativa & Rentabilidad Financiera
        </h1>
        <p className="text-xs text-ink-muted">
          Márgenes reales tras prorrateo de flete, composición de inventario (70% moda / 30% gadgets) y salud de cobranza.
        </p>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="erp-card p-5">
          <span className="text-xs text-ink-muted font-bold">Margen Bruto Real Acumulado</span>
          <h3 className="text-2xl font-extrabold text-moss mt-1">
            {formatNIO(kpis.monthlyGrossProfitNio)}
          </h3>
          <p className="text-xs text-ink-muted mt-1">
            Representa un <strong className="text-moss-800">{profitMarginPercent}%</strong> sobre ventas totales.
          </p>
        </div>

        <div className="erp-card p-5">
          <span className="text-xs text-ink-muted font-bold">Plusvalía Potencial en Bodega</span>
          <h3 className="text-2xl font-extrabold text-ink mt-1">
            {formatNIO(kpis.totalInventorySaleValueNio - kpis.totalInventoryCostNio)}
          </h3>
          <p className="text-xs text-ink-muted mt-1">
            Ganancia bruta proyectada al vender todo el stock físico.
          </p>
        </div>

        <div className="erp-card p-5">
          <span className="text-xs text-ink-muted font-bold">Tasa de Recuperación de Créditos</span>
          <h3 className="text-2xl font-extrabold text-amber-800 mt-1">
            {formatNIO(kpis.totalReceivablesNio)}
          </h3>
          <p className="text-xs text-ink-muted mt-1">
            Capital en manos de clientes pendiente de cobro.
          </p>
        </div>
      </div>

      {/* Product Mix (70/30 Rule breakdown) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="erp-card rounded-2xl p-5">
          <div className="flex items-center justify-between pb-3 border-b border-moss/10">
            <h3 className="font-bold text-sm text-ink">Distribución de Catálogo (Core 70/30)</h3>
            <span className="text-xs text-moss font-bold bg-moss/10 px-2.5 py-0.5 rounded-full border border-moss/20">
              Pajarita Store Target
            </span>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-bold text-ink">Ropa & Moda (Dama / Caballero)</span>
                <span className="font-bold text-moss">70% del Core</span>
              </div>
              <div className="w-full bg-surface-soft h-2.5 rounded-full overflow-hidden border border-moss/15">
                <div className="bg-moss h-full w-[70%] rounded-full" />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-bold text-ink">Fundas, Smartwatches & Gadgets</span>
                <span className="font-bold text-mustard-700">30% del Core</span>
              </div>
              <div className="w-full bg-surface-soft h-2.5 rounded-full overflow-hidden border border-moss/15">
                <div className="bg-mustard h-full w-[30%] rounded-full" />
              </div>
            </div>
          </div>
        </div>

        <div className="erp-card rounded-2xl p-5">
          <div className="flex items-center justify-between pb-3 border-b border-moss/10">
            <h3 className="font-bold text-sm text-ink">Reglas de Pricing por Margen</h3>
          </div>

          <div className="mt-4 space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-surface border border-moss/15 flex justify-between items-center shadow-xs">
              <div>
                <p className="font-bold text-ink">Costo Landed &lt; C$ 100</p>
                <span className="text-[11px] text-ink-muted">Fundas, accesorios, prendas livianas</span>
              </div>
              <span className="font-extrabold text-moss text-sm">40% Margen</span>
            </div>

            <div className="p-3 rounded-xl bg-surface border border-moss/15 flex justify-between items-center shadow-xs">
              <div>
                <p className="font-bold text-ink">Costo Landed &ge; C$ 100</p>
                <span className="text-[11px] text-ink-muted">Vestidos, conjuntos, smartwatches</span>
              </div>
              <span className="font-extrabold text-moss text-sm">30% Margen</span>
            </div>

            <div className="p-3 rounded-xl bg-surface border border-moss/15 flex justify-between items-center shadow-xs">
              <div>
                <p className="font-bold text-ink">Compras Bajo Pedido (Especial)</p>
                <span className="text-[11px] text-ink-muted">Encargos directos de clientes Shein/Amazon</span>
              </div>
              <span className="font-extrabold text-purple-800 text-sm">25% Margen</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
