import { SalesInvoice } from '@/domain/sales/types';
import { StockLevel, KardexMovement } from '@/domain/inventory/types';
import { Product } from '@/domain/catalog/types';

/**
 * Descarga un archivo CSV en el navegador agregando el BOM UTF-8 (\uFEFF)
 * para garantizar compatibilidad nativa con Microsoft Excel en español.
 */
export function downloadCsv(csvContent: string, fileName: string) {
  if (typeof window === 'undefined') return;

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName.endsWith('.csv') ? fileName : `${fileName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: any): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);
  // Mitigar CSV Formula Injection en Excel (=, +, -, @, tab)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Exporta el listado de facturas y ventas a formato Excel CSV.
 */
export function exportInvoicesToCsv(
  invoices: SalesInvoice[],
  options: { includeIva?: boolean } = {}
) {
  // En régimen de cuota fija (includeIva = false) no se exportan columnas de subtotal sin IVA ni IVA
  const includeIva = options.includeIva ?? false;
  const allHeaders = [
    'No. Factura',
    'Fecha Emisión',
    'Cliente',
    'Identificación / Cédula',
    'Teléfono WhatsApp',
    'Tipo Venta',
    'Condición Pago',
    'Subtotal Sin IVA (C$)',
    'Descuento (C$)',
    'IVA 15% (C$)',
    'Total Factura (C$)',
    'Monto Pagado (C$)',
    'Saldo Pendiente (C$)',
    'Estado Factura',
    'Estado Entrega',
    'Guía / Tracking',
    'Notas',
  ];
  const IVA_ONLY_COLUMNS = ['Subtotal Sin IVA (C$)', 'IVA 15% (C$)'];
  const keep = allHeaders.map((h) => includeIva || !IVA_ONLY_COLUMNS.includes(h));
  const headers = allHeaders.filter((_, i) => keep[i]);

  const rows = invoices.map((inv) => {
    // Facturas antiguas con desglose de IVA guardan el descuento sin IVA; sin desglose se expresa al precio final
    const hadIva = (inv.ivaRate ?? 0) > 0 && (inv.ivaTotalNio ?? 0) > 0;
    const discountFactor = !includeIva && hadIva ? 1 + (inv.ivaRate ?? 0) : 1;
    const row = [
    escapeCsvCell(inv.invoiceNumber),
    escapeCsvCell(inv.issueDate),
    escapeCsvCell(inv.customerName || 'Cliente General'),
    escapeCsvCell(inv.customerIdentification || ''),
    escapeCsvCell(inv.customerPhone || ''),
    escapeCsvCell(inv.saleType === 'pedido' ? 'Bajo Pedido' : 'Venta Regular'),
    escapeCsvCell(inv.paymentTerm === 'credito' ? 'Crédito' : 'Contado'),
    escapeCsvCell((inv.subtotalSinIvaNio || 0).toFixed(2)),
    escapeCsvCell(((inv.discountNio || 0) * discountFactor).toFixed(2)),
    escapeCsvCell((inv.ivaTotalNio || 0).toFixed(2)),
    escapeCsvCell((inv.totalNio || 0).toFixed(2)),
    escapeCsvCell((inv.amountPaidNio || 0).toFixed(2)),
    escapeCsvCell((inv.balanceDueNio || 0).toFixed(2)),
    escapeCsvCell(inv.status.toUpperCase()),
    escapeCsvCell(inv.deliveryStatus.toUpperCase()),
    escapeCsvCell(inv.trackingRef || ''),
    escapeCsvCell(inv.notes || ''),
    ];
    return row.filter((_, i) => keep[i]);
  });

  const csvString = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadCsv(csvString, `Reporte_Ventas_PajaritaStore_${dateStr}.csv`);
}

/**
 * Exporta el inventario físico valorizado a formato Excel CSV.
 */
export function exportInventoryToCsv(stock: StockLevel[]) {
  const headers = [
    'Código SKU',
    'Producto',
    'Descripción Variante',
    'Talla',
    'Color',
    'Costo Landed Unitario (C$)',
    'Precio Venta Regular (C$)',
    'Stock Disponible',
    'Stock Reservado',
    'Valor Costo Total (C$)',
    'Valor Venta Total (C$)',
  ];

  const rows = stock.map((s) => {
    const costTotal = (s.costPriceNio || 0) * s.quantityAvailable;
    const saleTotal = (s.salePriceNio || 0) * s.quantityAvailable;

    return [
      escapeCsvCell(s.skuCode),
      escapeCsvCell(s.productName),
      escapeCsvCell(s.skuDescription || ''),
      escapeCsvCell(s.size || 'Única'),
      escapeCsvCell(s.colorName || 'N/A'),
      escapeCsvCell((s.costPriceNio || 0).toFixed(2)),
      escapeCsvCell((s.salePriceNio || 0).toFixed(2)),
      escapeCsvCell(s.quantityAvailable),
      escapeCsvCell(s.quantityReserved),
      escapeCsvCell(costTotal.toFixed(2)),
      escapeCsvCell(saleTotal.toFixed(2)),
    ];
  });

  const csvString = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadCsv(csvString, `Inventario_Valorizado_PajaritaStore_${dateStr}.csv`);
}

/**
 * Exporta el catálogo completo de productos con sus variantes.
 */
export function exportCatalogToCsv(products: Product[]) {
  const headers = [
    'Código Producto',
    'ID Producto (UUID)',
    'Nombre Producto',
    'Categoría',
    'Subcategoría',
    'Tipo',
    'Código SKU',
    'Descripción SKU',
    'Talla',
    'Color',
    'Costo NIO',
    'Precio Venta NIO',
    'Estado',
    'Fecha Creación',
  ];

  const rows: string[][] = [];

  products.forEach((p) => {
    const pCode = p.productCode || 'PRD-PENDIENTE';
    const pCreatedAt = p.createdAt ? p.createdAt.split('T')[0] : '';
    if (!p.skus || p.skus.length === 0) {
      rows.push([
        escapeCsvCell(pCode),
        escapeCsvCell(p.id),
        escapeCsvCell(p.name),
        escapeCsvCell(p.categoryName || ''),
        escapeCsvCell(p.subcategoryName || ''),
        escapeCsvCell(p.productType),
        escapeCsvCell('Sin SKUs'),
        escapeCsvCell(''),
        escapeCsvCell(''),
        escapeCsvCell(''),
        escapeCsvCell('0.00'),
        escapeCsvCell('0.00'),
        escapeCsvCell(p.isActive ? 'Activo' : 'Inactivo'),
        escapeCsvCell(pCreatedAt),
      ]);
    } else {
      p.skus.forEach((s) => {
        const skuCreatedAt = s.createdAt ? s.createdAt.split('T')[0] : pCreatedAt;
        rows.push([
          escapeCsvCell(pCode),
          escapeCsvCell(p.id),
          escapeCsvCell(p.name),
          escapeCsvCell(p.categoryName || ''),
          escapeCsvCell(p.subcategoryName || ''),
          escapeCsvCell(p.productType),
          escapeCsvCell(s.skuCode),
          escapeCsvCell(s.skuDescription || ''),
          escapeCsvCell(s.size || ''),
          escapeCsvCell(s.colorName || ''),
          escapeCsvCell((s.costPriceNio || 0).toFixed(2)),
          escapeCsvCell((s.salePriceNio || 0).toFixed(2)),
          escapeCsvCell(s.isActive ? 'Activo' : 'Inactivo'),
          escapeCsvCell(skuCreatedAt),
        ]);
      });
    }
  });

  const csvString = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadCsv(csvString, `Catalogo_Productos_PajaritaStore_${dateStr}.csv`);
}

/**
 * Exporta los movimientos del Kardex a formato Excel CSV.
 */
export function exportKardexToCsv(movements: KardexMovement[]) {
  const headers = [
    'Fecha y Hora',
    'Tipo Movimiento',
    'Código SKU',
    'Producto',
    'Cantidad Afectada',
    'Stock Previo',
    'Nuevo Stock',
    'Referencia Doc.',
    'Notas',
  ];

  const rows = movements.map((m) => [
    escapeCsvCell(m.createdAt),
    escapeCsvCell(m.movementType),
    escapeCsvCell(m.skuCode),
    escapeCsvCell(m.productName),
    escapeCsvCell(m.quantity),
    escapeCsvCell(m.previousStock),
    escapeCsvCell(m.newStock),
    escapeCsvCell(m.referenceId || ''),
    escapeCsvCell(m.notes || ''),
  ]);

  const csvString = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadCsv(csvString, `Kardex_Movimientos_PajaritaStore_${dateStr}.csv`);
}
