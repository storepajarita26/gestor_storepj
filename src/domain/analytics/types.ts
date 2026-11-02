// Dominio de Analítica y KPIs Ejecutivos
export interface DashboardKpis {
  totalActiveSkus: number;
  totalInventoryCostNio: number;
  totalInventorySaleValueNio: number;
  capitalInTransitUsd: number;
  capitalInTransitNio: number;
  ordersInTransitCount: number;
  monthlySalesNio: number;
  monthlyNetSalesSinIvaNio?: number;
  monthlyGrossProfitNio: number;
  totalReceivablesNio: number; // Cuentas por cobrar
  pendingInvoicesCount: number;
}

export interface CategoryInventoryDistribution {
  categoryName: string;
  productCount: number;
  stockCount: number;
  inventoryValueNio: number;
  percentage: number;
}

export interface SalesCategoryBreakdown {
  categoryName: string;
  totalSalesNio: number;
  percentage: number;
}

export interface PurchaseTransitSummary {
  orderNumber: string;
  supplierName: string;
  trackingNumber: string;
  status: string;
  datePurchased: string;
  totalCostNio: number;
  itemsCount: number;
}
