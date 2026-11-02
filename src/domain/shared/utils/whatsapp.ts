import { SalesInvoice } from '@/domain/sales/types';
import { formatNIO } from './currencyFormatter';

/**
 * Enlaces de WhatsApp (wa.me). Funcionan en el celular (abre la app) y en la
 * computadora (WhatsApp Web / Desktop) sin integración ni costo.
 */

/** Teléfono en formato internacional sin signos. Números de 8 dígitos se asumen de Nicaragua (+505). */
export function normalizeWhatsappPhone(phone?: string): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 8) return `505${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

/** Enlace para abrir un chat con el mensaje escrito. Sin teléfono válido, WhatsApp pide elegir el contacto. */
export function whatsappUrl(phone: string | undefined, text: string): string {
  const number = normalizeWhatsappPhone(phone);
  const query = `text=${encodeURIComponent(text)}`;
  return number ? `https://wa.me/${number}?${query}` : `https://wa.me/?${query}`;
}

export function openWhatsapp(phone: string | undefined, text: string) {
  if (typeof window === 'undefined') return;
  window.open(whatsappUrl(phone, text), '_blank', 'noopener,noreferrer');
}

const PAYMENT_LABEL: Record<string, string> = {
  efectivo_cordobas: 'efectivo C$',
  efectivo_dolares: 'efectivo US$',
  transferencia_bancaria: 'transferencia',
  tarjeta: 'tarjeta',
  otro: 'otro',
};

function formatDate(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Resumen de la factura para enviar al cliente */
export function buildInvoiceMessage(invoice: SalesInvoice, storeName: string): string {
  const firstName = (invoice.customerName || '').split(' ')[0];
  const greeting = firstName && !/consumidor/i.test(invoice.customerName || '') ? `¡Hola ${firstName}! ` : '¡Hola! ';
  const lines = (invoice.items || []).map((it) => {
    const detail = [it.size, it.colorName].filter(Boolean).join(' ');
    const name = `${it.productName || it.skuCode || 'Prenda'}${detail ? ` (${detail})` : ''}`;
    return `• ${it.quantity} × ${name} — ${formatNIO(it.lineTotalConIvaNio ?? it.lineTotalNio)}`;
  });
  const total = invoice.totalConIvaNio || invoice.totalNio;
  const credited = invoice.creditedNio || 0;
  const out: string[] = [
    `${greeting}Gracias por tu compra en ${storeName} 💛`,
    '',
    `*Factura ${invoice.invoiceNumber}* · ${formatDate(invoice.issueDate)}`,
    ...lines,
    '',
    `*Total: ${formatNIO(total)}*`,
  ];
  if (credited > 0) out.push(`Devoluciones: −${formatNIO(credited)}`);
  if ((invoice.amountPaidNio || 0) > 0) {
    const methods = Array.from(new Set((invoice.payments || []).map((p) => PAYMENT_LABEL[p.paymentMethod] || p.paymentMethod)));
    out.push(`Pagado: ${formatNIO(invoice.amountPaidNio)}${methods.length ? ` (${methods.join(', ')})` : ''}`);
  }
  if (invoice.status === 'anulada') {
    out.push('Esta factura fue anulada.');
  } else if ((invoice.balanceDueNio || 0) > 0.009) {
    out.push(`*Saldo pendiente: ${formatNIO(invoice.balanceDueNio)}*${invoice.dueDate ? ` · vence el ${formatDate(invoice.dueDate)}` : ''}`);
  }
  if (invoice.saleType === 'pedido' && invoice.deliveryStatus !== 'entregado') {
    out.push('Te avisaremos cuando tu pedido esté listo para entrega.');
  }
  if (invoice.trackingRef) out.push(`Guía de envío: ${invoice.trackingRef}`);
  return out.join('\n');
}

/** Recordatorio amable de saldo pendiente */
export function buildReminderMessage(
  customerName: string,
  storeName: string,
  pending: { invoiceNumber: string; balanceDueNio: number; dueDate?: string; daysOverdue: number }[]
): string {
  const firstName = (customerName || '').split(' ')[0];
  const total = pending.reduce((acc, p) => acc + p.balanceDueNio, 0);
  const detail = pending.map((p) => {
    const when =
      p.daysOverdue > 0
        ? `venció el ${formatDate(p.dueDate)}`
        : p.daysOverdue === 0
        ? 'vence hoy'
        : `vence el ${formatDate(p.dueDate)}`;
    return `• ${p.invoiceNumber}: ${formatNIO(p.balanceDueNio)} (${when})`;
  });
  return [
    `¡Hola ${firstName}! Te saluda ${storeName} 😊`,
    `Te compartimos el detalle de tu saldo pendiente:`,
    ...detail,
    '',
    `*Total pendiente: ${formatNIO(total)}*`,
    '',
    'Puedes abonar en tienda, por transferencia o en efectivo. ¡Gracias por tu preferencia!',
  ].join('\n');
}
