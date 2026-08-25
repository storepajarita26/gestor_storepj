// Subdominio Shared: Tipos comunes y valores monetarios
export type CurrencyCode = 'NIO' | 'USD';

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
