'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Receipt,
  Scale,
  Sparkles,
  Layers,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { calculateDashboardKpis, calculateCategoryDistribution } from '@/domain/analytics/services/kpiCalculator';
import { DashboardKpis, CategoryInventoryDistribution } from '@/domain/analytics/types';

export function AnaliticaView() {
  const [kpis, setKpis] = useState<DashboardKpis>({
    totalActiveSkus: 0,
    totalInventoryCostNio: 0,
    totalInventorySaleValueNio: 0,
    capitalInTransitUsd: 0,
    capitalInTransitNio: 0,
    ordersInTransitCount: 0,
    monthlySalesNio: 0,
    monthlyNetSalesSinIvaNio: 0,
    monthlyGrossProfitNio: 0,
    totalReceivablesNio: 0,
    pendingInvoicesCount: 0,
  });

  const [categoryDist, setCategoryDist] = useState<CategoryInventoryDistribution[]>([]);

  const refreshData = () => {
    const skus = dataStore.getAllSkus();
    const stocks = dataStore.getStock();
    const orders = dataStore.getPurchaseOrders();
    const invoices = dataStore.getInvoices();
    const products = dataStore.getProducts();
    const rate = dataStore.getExchangeRate();

    const calculatedKpis = calculateDashboardKpis(skus, stocks, orders, invoices, rate, undefined, dataStore.getTaxRegime());
    setKpis(calculatedKpis);

    const dist = calculateCategoryDistribution(products, stocks);
    setCategoryDist(dist);
  };

  useEffect(() => {
    refreshData();
    const unsub = dataStore.subscribe(refreshData);
    return unsub;
  }, []);

  // En cuota fija no hay IVA trasladado: la venta neta es lo facturado
  const hasIva = dataStore.getIvaRate() > 0;
  const netSales = kpis.monthlyNetSalesSinIvaNio ?? kpis.monthlySalesNio;
  const ivaCollected = hasIva ? Math.max(0, kpis.monthlySalesNio - netSales) : 0;
  const costOfSales = Math.max(0, netSales - kpis.monthlyGrossProfitNio);
  const profitMarginPercent = netSales > 0
    ? Math.round((kpis.monthlyGrossProfitNio / netSales) * 100)
    : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-4">

        <div className="flex items-center gap-2 bg-surface border border-moss/15 px-3 py-1.5 rounded-xl text-xs shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-moss" />
          <span className="text-ink-muted font-medium">Período Activo:</span>
          <span className="font-bold text-moss">Mes en Curso</span>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="erp-card p-5">
          <span className="text-xs text-ink-muted font-bold">Margen Bruto Real del Mes (Neto)</span>
          <h3 className="text-2xl font-extrabold text-moss mt-1">
            {formatNIO(kpis.monthlyGrossProfitNio)}
          </h3>
          <p className="text-xs text-ink-muted mt-1">
            Representa un <strong className="text-moss-800">{profitMarginPercent}%</strong> sobre ventas netas{hasIva ? ' sin IVA' : ''} ({formatNIO(netSales)}).
          </p>
        </div>

        <div className="erp-card p-5">
          <span className="text-xs text-ink-muted font-bold">Plusvalía Potencial en Bodega</span>
          <h3 className="text-2xl font-extrabold text-ink mt-1">
            {formatNIO(kpis.totalInventorySaleValueNio - kpis.totalInventoryCostNio)}
          </h3>
          <p className="text-xs text-ink-muted mt-1">
            Ganancia bruta proyectada al liquidar todo el stock disponible ({formatNIO(kpis.totalInventorySaleValueNio)}).
          </p>
        </div>

        <div className="erp-card p-5">
          <span className="text-xs text-ink-muted font-bold">Saldo Total en Cuentas por Cobrar</span>
          <h3 className="text-2xl font-extrabold text-amber-800 mt-1">
            {formatNIO(kpis.totalReceivablesNio)}
          </h3>
          <p className="text-xs text-ink-muted mt-1">
            Capital en manos de clientes ({kpis.pendingInvoicesCount} facturas con cuotas pendientes).
          </p>
        </div>
      </div>

      {/* Product Mix and Financial Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Real Dynamic Category Distribution */}
        <div className="erp-card rounded-2xl p-5">
          <div className="flex items-center justify-between pb-3 border-b border-moss/10">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-moss" />
              <h3 className="font-bold text-sm text-ink">Composición Real del Inventario por Categoría</h3>
            </div>
            <span className="text-[11px] text-moss font-bold bg-moss/10 px-2.5 py-0.5 rounded-full border border-moss/20">
              Datos Dinámicos
            </span>
          </div>

          <div className="mt-4 space-y-4">
            {categoryDist.length === 0 ? (
              <p className="text-xs text-ink-muted italic py-4 text-center">
                No hay productos en inventario para calcular distribución.
              </p>
            ) : (
              categoryDist.map((cat, idx) => {
                const colors = [
                  'bg-moss',
                  'bg-sky-500',
                  'bg-indigo-600',
                  'bg-teal-600',
                  'bg-amber-600',
                ];
                const barColor = colors[idx % colors.length];

                return (
                  <div key={cat.categoryName} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <div>
                        <span className="font-bold text-ink">{cat.categoryName}</span>
                        <span className="text-[10px] text-ink-muted ml-1.5 font-normal">
                          ({cat.productCount} prods &bull; {cat.stockCount} pzs en bodega)
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-ink">{cat.percentage}%</span>
                        <span className="text-[10px] text-ink-muted ml-1 font-mono">
                          ({formatNIO(cat.inventoryValueNio)})
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-surface-soft h-2.5 rounded-full overflow-hidden border border-moss/15">
                      <div
                        className={`${barColor} h-full rounded-full transition-all duration-500`}
                        style={{ width: `${Math.max(4, cat.percentage)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Financial Breakdown & Pricing Rules */}
        <div className="erp-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-moss/10">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-moss" />
              <h3 className="font-bold text-sm text-ink">
                {hasIva ? 'Desglose Fiscal y Políticas de Margen' : 'Ventas y Políticas de Margen'}
              </h3>
            </div>
            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
              {hasIva ? 'IVA 15% Nicaragua' : 'Régimen de Cuota Fija'}
            </span>
          </div>

          {/* Fiscal Cards Breakdown */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-surface border border-moss/15 shadow-xs">
              <span className="text-[10px] font-bold text-ink-muted uppercase block">
                {hasIva ? 'Ventas Netas (Sin IVA)' : 'Ventas Netas del Mes'}
              </span>
              <p className="text-base font-extrabold text-ink mt-0.5">{formatNIO(netSales)}</p>
              <span className="text-[10px] text-ink-muted">
                {hasIva ? 'Base de cálculo comercial' : 'Total facturado, sin IVA trasladado'}
              </span>
            </div>

            {hasIva ? (
              <div className="p-3 rounded-xl bg-surface border border-moss/15 shadow-xs">
                <span className="text-[10px] font-bold text-amber-700 uppercase block">Débito Fiscal IVA (15%)</span>
                <p className="text-base font-extrabold text-amber-800 mt-0.5">{formatNIO(ivaCollected)}</p>
                <span className="text-[10px] text-ink-muted">Pasivo recaudado para DGI</span>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-surface border border-moss/15 shadow-xs">
                <span className="text-[10px] font-bold text-ink-muted uppercase block">Costo de lo Vendido</span>
                <p className="text-base font-extrabold text-ink mt-0.5">{formatNIO(costOfSales)}</p>
                <span className="text-[10px] text-ink-muted">Costo landed de las prendas vendidas</span>
              </div>
            )}
          </div>

          {/* Pricing Rules */}
          <div className="space-y-2.5 text-xs pt-1">
            <div className="p-2.5 rounded-xl bg-surface border border-moss/15 flex justify-between items-center shadow-xs">
              <div>
                <p className="font-bold text-ink">Costo Landed &lt; C$ 100</p>
                <span className="text-[11px] text-ink-muted">Accesorios, fundas y prendas livianas</span>
              </div>
              <span className="font-extrabold text-moss text-xs">40% Margen (Costo / 0.60)</span>
            </div>

            <div className="p-2.5 rounded-xl bg-surface border border-moss/15 flex justify-between items-center shadow-xs">
              <div>
                <p className="font-bold text-ink">Costo Landed &ge; C$ 100</p>
                <span className="text-[11px] text-ink-muted">Vestidos, conjuntos, smartwatches</span>
              </div>
              <span className="font-extrabold text-moss text-xs">30% Margen (Costo / 0.70)</span>
            </div>

            <div className="p-2.5 rounded-xl bg-surface border border-moss/15 flex justify-between items-center shadow-xs">
              <div>
                <p className="font-bold text-ink">Compras Bajo Pedido (Especial)</p>
                <span className="text-[11px] text-ink-muted">Encargos directos de clientes Shein/Amazon</span>
              </div>
              <span className="font-extrabold text-purple-800 text-xs">25% Margen (Costo / 0.75)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
