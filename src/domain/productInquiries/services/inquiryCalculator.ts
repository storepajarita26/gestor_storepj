import { ProductInquiry, ProductInquiryPlatform } from '../types';
import { formatUSD, formatNIO, convertUsdToNio } from '@/domain/shared/utils/currencyFormatter';

/**
 * Calcula el costo total en dólares sumando el precio del producto y el costo de envío.
 */
export function calculateTotalCost(priceUsd: number, shippingCostUsd: number): number {
  const p = Number(priceUsd) || 0;
  const s = Number(shippingCostUsd) || 0;
  return Number((p + s).toFixed(2));
}

/**
 * Calcula el precio de venta estimado en base a la regla de negocio:
 * costo total / 0.8 (margen bruto equivalente al 20% sobre el precio de venta)
 */
export function calculateEstimatedSalePrice(totalCostUsd: number): number {
  const c = Number(totalCostUsd) || 0;
  if (c <= 0) return 0;
  return Number((c / 0.8).toFixed(2));
}

/**
 * Calcula el margen de ganancia proyectado en dólares y porcentaje.
 */
export function calculateMargin(
  costUsd: number,
  salePriceUsd: number
): { marginUsd: number; marginPercent: number } {
  const cost = Number(costUsd) || 0;
  const price = Number(salePriceUsd) || 0;
  if (price <= 0) return { marginUsd: 0, marginPercent: 0 };
  const marginUsd = Number((price - cost).toFixed(2));
  const marginPercent = Number(((marginUsd / price) * 100).toFixed(1));
  return { marginUsd, marginPercent };
}

/**
 * Detecta la plataforma (Shein, Amazon u otra) a partir de una URL dada.
 */
export function detectPlatformFromUrl(url: string): ProductInquiryPlatform {
  if (!url) return 'otro';
  const lower = url.toLowerCase();
  if (lower.includes('shein.com') || lower.includes('shein.')) {
    return 'shein';
  }
  if (lower.includes('amazon.com') || lower.includes('amazon.') || lower.includes('amzn.to') || lower.includes('a.co')) {
    return 'amazon';
  }
  return 'otro';
}

/**
 * Intenta extraer el SKU o ID del producto de enlaces comunes de Shein o Amazon.
 */
export function extractSkuFromUrl(url: string): string {
  if (!url) return '';
  try {
    // 1. Shein: busca patrones tipo -p-12345678.html o goods_id=12345678
    const sheinMatch = url.match(/-p-([a-zA-Z0-9_-]+)\.html/i) || url.match(/[?&]goods_id=([0-9]+)/i);
    if (sheinMatch && sheinMatch[1]) {
      return sheinMatch[1];
    }

    // 2. Amazon: patrón estándar ASIN /dp/B0XXXXXXXX o /gp/product/B0XXXXXXXX
    const amazonMatch = url.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})/i);
    if (amazonMatch && amazonMatch[1]) {
      return amazonMatch[1];
    }
  } catch {
    // Ignorar errores de regex en URLs malformadas
  }
  return '';
}

/**
 * Genera el texto formateado para enviar una cotización rápida por WhatsApp al cliente.
 */
export function buildWhatsappQuoteMessage(
  inquiry: ProductInquiry,
  exchangeRate: number,
  storeName: string = 'Pajarita Store'
): string {
  const saleNio =
    inquiry.finalSalePriceNio ||
    convertUsdToNio(inquiry.finalSalePriceUsd || inquiry.estimatedSalePriceUsd, exchangeRate);
  const saleUsd =
    inquiry.finalSalePriceUsd ||
    (saleNio && exchangeRate ? Number((saleNio / exchangeRate).toFixed(2)) : inquiry.estimatedSalePriceUsd);
  const platformLabel =
    inquiry.platform === 'shein' ? 'Shein' : inquiry.platform === 'amazon' ? 'Amazon' : 'tienda en línea';

  let msg = `¡Hola ${inquiry.customerName || 'estimad@ cliente'}! 🌸✨\n\n`;
  msg += `Te compartimos la cotización de tu consulta en *${storeName}* (${platformLabel}):\n\n`;

  if (inquiry.skuId) {
    msg += `🔖 *Código / SKU:* ${inquiry.skuId}\n`;
  }
  if (inquiry.productTitle) {
    msg += `👗 *Producto:* ${inquiry.productTitle}\n`;
  }
  if (inquiry.notes) {
    msg += `📝 *Detalles (talla/color):* ${inquiry.notes}\n`;
  }

  msg += `\n💰 *Precio de Venta Final:*\n`;
  msg += `• *${formatNIO(saleNio)}* córdobas\n`;
  msg += `• *${formatUSD(saleUsd)}* dólares (Tasa: C$ ${exchangeRate.toFixed(2)})\n\n`;

  if (inquiry.productUrl) {
    msg += `🔗 *Enlace de referencia:* ${inquiry.productUrl}\n\n`;
  }

  msg += `_¿Deseas que lo agreguemos a tu próximo pedido? Quedamos a tu orden con todo gusto._ 🛍️`;

  return msg;
}
