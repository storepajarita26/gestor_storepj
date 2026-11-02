// Subdominio Shared: Tipos comunes y valores monetarios
export type CurrencyCode = 'NIO' | 'USD';

/**
 * Régimen fiscal de la tienda ante la DGI (Nicaragua).
 * - 'cuota_fija': la tienda paga una cuota mensual fija y NO traslada IVA en sus facturas.
 * - 'general': responsable inscrito; las facturas desglosan IVA 15%.
 */
export type TaxRegime = 'cuota_fija' | 'general';

export interface ExchangeRate {
  id: string;
  rateUsdToNio: number;
  effectiveDate: string;
  isActive: boolean;
}

export interface MoneyValue {
  amount: number;
  currency: CurrencyCode;
}

export interface PaginationParams {
  page: number;
  limit: number;
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface StoreSettings {
  storeName: string;
  phoneWhatsapp: string;
  address: string;
  email?: string;
  website?: string;
  ruc?: string;
  taxRegime?: TaxRegime; // Por defecto 'cuota_fija'
  /** Días de plazo por defecto en las ventas a crédito (vencimiento de la factura) */
  defaultCreditDays?: number;
}
