// Funciones puras de formateo monetario y conversión de divisas
export function formatNIO(amount: number): string {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0).replace('NIO', 'C$');
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export function convertUsdToNio(amountUsd: number, exchangeRate: number): number {
  if (!amountUsd || !exchangeRate) return 0;
  return Number((amountUsd * exchangeRate).toFixed(2));
}

export function convertNioToUsd(amountNio: number, exchangeRate: number): number {
  if (!amountNio || !exchangeRate || exchangeRate === 0) return 0;
  return Number((amountNio / exchangeRate).toFixed(2));
}
