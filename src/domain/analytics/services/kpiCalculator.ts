import { Product, ProductSku } from '../../catalog/types';
import { StockLevel } from '../../inventory/types';
import { PurchaseOrder } from '../../procurement/types';
import { SalesInvoice } from '../../sales/types';
import { DashboardKpis, CategoryInventoryDistribution } from '../types';
import { TaxRegime } from '../../shared/types';

export function calculateDashboardKpis(
  skus: ProductSku[],
  stocks: StockLevel[],
  orders: PurchaseOrder[],
  invoices: SalesInvoice[],
  exchangeRate: number = 36.80,
  targetMonth?: string, // Formato 'YYYY-MM' o undefined para mes actual/activo
  taxRegime: TaxRegime = 'cuota_fija'
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

  // 4. Ventas del mes y ganancia bruta real (Excluyendo IVA fiscal)
  const validInvoices = invoices.filter(i => i.status !== 'anulada');
  
  // Determinar período mensual objetivo
  const currentMonthKey = targetMonth || new Date().toISOString().slice(0, 7);
  let monthlyInvoices = validInvoices.filter(i => (i.issueDate || '').startsWith(currentMonthKey));
  
  // Si no hay facturas en el mes en curso (ej: datos semilla de prueba), usar el mes de la última factura para mostrar analítica real
  if (monthlyInvoices.length === 0 && validInvoices.length > 0 && !targetMonth) {
    const dates = validInvoices.map(i => i.issueDate).filter(Boolean).sort();
    const latestMonth = dates[dates.length - 1]?.slice(0, 7);
    if (latestMonth) {
      monthlyInvoices = validInvoices.filter(i => (i.issueDate || '').startsWith(latestMonth));
    }
  }

  // Ventas brutas totales del mes (con IVA incluido para flujo de caja)
  const monthlySalesNio = monthlyInvoices.reduce((acc, i) => acc + (i.totalNio || 0), 0);
  
  // Ventas netas reales del mes.
  // - Cuota fija: la tienda no traslada IVA; todo lo facturado (ya neto de descuentos) es ingreso propio.
  // - Régimen general: base imponible sin IVA menos descuentos comerciales.
  const monthlyNetSalesSinIvaNio = monthlyInvoices.reduce((acc, inv) => {
    if (taxRegime === 'cuota_fija') {
      // Lo facturado menos las notas de crédito (devoluciones)
      return acc + (inv.totalNio || 0) - (inv.creditedNio || 0);
    }
    const subtotal = inv.subtotalSinIvaNio ?? (inv.subtotalNio ? inv.subtotalNio / 1.15 : inv.totalNio / 1.15);
    const discount = inv.discountNio || 0;
    return acc + Math.max(0, subtotal - discount);
  }, 0);

  // Costo total de mercancía vendida en el mes (COGS)
  const monthlyCostNio = monthlyInvoices.reduce((acc, inv) => {
    // Unidades devueltas a bodega por nota de crédito no son costo de lo vendido
    const returned = new Map<string, number>();
    (inv.creditNotes || []).filter((cn) => cn.restock).forEach((cn) =>
      (cn.items || []).forEach((ci) => returned.set(ci.skuId, (returned.get(ci.skuId) || 0) + ci.quantity)));
    const invCost = (inv.items || []).reduce((itemAcc, item) => {
      const back = Math.min(item.quantity || 0, returned.get(item.skuId) || 0);
      if (back > 0) returned.set(item.skuId, (returned.get(item.skuId) || 0) - back);
      return itemAcc + (item.unitCostNio || 0) * ((item.quantity || 1) - back);
    }, 0);
    return acc + invCost;
  }, 0);

  // Margen bruto comercial real = Venta Neta Sin IVA - Costo de Mercancía
  const monthlyGrossProfitNio = Math.max(0, monthlyNetSalesSinIvaNio - monthlyCostNio);

  // 5. Cuentas por cobrar (Créditos pendientes acumulados)
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
    monthlyNetSalesSinIvaNio: Number(monthlyNetSalesSinIvaNio.toFixed(2)),
    monthlyGrossProfitNio: Number(monthlyGrossProfitNio.toFixed(2)),
    totalReceivablesNio: Number(totalReceivablesNio.toFixed(2)),
    pendingInvoicesCount,
  };
}

/**
 * Calcula la distribución real del catálogo y del valor de inventario por categoría
 */
export function calculateCategoryDistribution(
  products: Product[],
  stocks: StockLevel[]
): CategoryInventoryDistribution[] {
  const map: Record<string, { productCount: number; stockCount: number; inventoryValueNio: number }> = {};

  products.forEach((prod) => {
    const cat = prod.categoryName || 'General';
    if (!map[cat]) {
      map[cat] = { productCount: 0, stockCount: 0, inventoryValueNio: 0 };
    }
    map[cat].productCount += 1;
  });

  const skuToCategoryMap = new Map<string, string>();
  products.forEach((prod) => {
    const cat = prod.categoryName || 'General';
    (prod.skus || []).forEach((sku) => {
      skuToCategoryMap.set(sku.id, cat);
    });
  });

  stocks.forEach((st) => {
    const cat = skuToCategoryMap.get(st.skuId) || 'General';
    if (!map[cat]) {
      map[cat] = { productCount: 0, stockCount: 0, inventoryValueNio: 0 };
    }
    map[cat].stockCount += st.quantityAvailable;
    map[cat].inventoryValueNio += (st.quantityAvailable * (st.costPriceNio || 0));
  });

  const totalValue = Object.values(map).reduce((acc, c) => acc + c.inventoryValueNio, 0);

  return Object.entries(map).map(([categoryName, data]) => ({
    categoryName,
    productCount: data.productCount,
    stockCount: data.stockCount,
    inventoryValueNio: Number(data.inventoryValueNio.toFixed(2)),
    percentage: totalValue > 0 ? Math.round((data.inventoryValueNio / totalValue) * 100) : 0,
  })).sort((a, b) => b.inventoryValueNio - a.inventoryValueNio);
}
