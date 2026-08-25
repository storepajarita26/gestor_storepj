import { ProductSku } from '../../catalog/types';
import { StockLevel } from '../../inventory/types';
import { PurchaseOrder } from '../../procurement/types';
import { SalesInvoice } from '../../sales/types';
import { DashboardKpis } from '../types';

export function calculateDashboardKpis(
  skus: ProductSku[],
  stocks: StockLevel[],
  orders: PurchaseOrder[],
  invoices: SalesInvoice[],
  exchangeRate: number = 36.80
): DashboardKpis {
  // 1. SKUs activos
  const totalActiveSkus = skus.filter(s => s.isActive).length;

  // 2. Dinero en inventario
  const totalInventoryCostNio = stocks.reduce(
    (acc, s) => acc + (s.quantityAvailable * (s.costPriceNio || 0)),
    0
  );
  const totalInventorySaleValueNio = stocks.reduce(
    (acc, s) => acc + (s.quantityAvailable * (s.salePriceNio || 0)),
    0
  );

  // 3. Dinero y órdenes en tránsito (no recibidas completamente)
  const inTransitStatuses = ['comprado', 'en_agencia_envio', 'en_transito_nicaragua', 'recibido_parcial'];
  const transitOrders = orders.filter(o => inTransitStatuses.includes(o.status));
  const ordersInTransitCount = transitOrders.length;

  const capitalInTransitUsd = transitOrders.reduce((acc, o) => acc + (o.totalCostUsd || 0), 0);
  const capitalInTransitNio = transitOrders.reduce(
    (acc, o) => acc + (o.totalCostNio || (o.totalCostUsd * exchangeRate)) + (o.totalImportExpensesNio || 0),
    0
  );

  // 4. Ventas del mes y ganancia bruta
  const validInvoices = invoices.filter(i => i.status !== 'anulada');
  const monthlySalesNio = validInvoices.reduce((acc, i) => acc + (i.totalNio || 0), 0);
  
  // Costo total de lo vendido para margen bruto
  const monthlyCostNio = validInvoices.reduce((acc, inv) => {
    const invCost = (inv.items || []).reduce(
      (itemAcc, item) => itemAcc + (item.unitCostNio || 0) * (item.quantity || 1),
      0
    );
    return acc + invCost;
  }, 0);
  
  const monthlyGrossProfitNio = Math.max(0, monthlySalesNio - monthlyCostNio);

  // 5. Cuentas por cobrar (Créditos pendientes)
  const pendingInvoices = validInvoices.filter(i => (i.balanceDueNio || 0) > 0);
  const totalReceivablesNio = pendingInvoices.reduce((acc, i) => acc + (i.balanceDueNio || 0), 0);
  const pendingInvoicesCount = pendingInvoices.length;

  return {
    totalActiveSkus,
    totalInventoryCostNio: Number(totalInventoryCostNio.toFixed(2)),
    totalInventorySaleValueNio: Number(totalInventorySaleValueNio.toFixed(2)),
    capitalInTransitUsd: Number(capitalInTransitUsd.toFixed(2)),
    capitalInTransitNio: Number(capitalInTransitNio.toFixed(2)),
    ordersInTransitCount,
    monthlySalesNio: Number(monthlySalesNio.toFixed(2)),
    monthlyGrossProfitNio: Number(monthlyGrossProfitNio.toFixed(2)),
    totalReceivablesNio: Number(totalReceivablesNio.toFixed(2)),
    pendingInvoicesCount,
  };
}
