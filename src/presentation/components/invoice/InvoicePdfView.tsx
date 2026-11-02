'use client';

import React from 'react';
import {
  Printer,
  X,
  MapPin,
  Phone,
  Tag,
  Sparkles,
  FileText,
  MessageCircle,
} from 'lucide-react';
import { buildInvoiceMessage, openWhatsapp } from '@/domain/shared/utils/whatsapp';
import { SalesInvoice } from '@/domain/sales/types';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { invoiceHasIva } from '@/domain/sales/services/invoicingService';

interface InvoicePdfViewProps {
  invoice: SalesInvoice;
  onClose?: () => void;
  /** false cuando la pantalla que la muestra ya tiene sus propios botones (imprimir, WhatsApp) */
  showToolbar?: boolean;
}

export function InvoicePdfView({ invoice, onClose, showToolbar = true }: InvoicePdfViewProps) {
  const storeSettings = dataStore.getStoreSettings();

  // Régimen fiscal: el IVA solo se desglosa si la tienda está en régimen general
  // y la factura se emitió con IVA. En cuota fija se muestran precios finales.
  const showIva = dataStore.getIvaRate() > 0 && invoiceHasIva(invoice);
  // Facturas antiguas emitidas con desglose de IVA guardan precios "sin IVA": al no desglosar,
  // se convierten al precio final que pagó el cliente (precio sin IVA x (1 + tasa)).
  const priceFactor = !showIva && invoiceHasIva(invoice) ? 1 + (invoice.ivaRate ?? 0) : 1;
  const fx = (amount: number) => Number(((amount || 0) * priceFactor).toFixed(2));

  // Desglose fiscal (solo aplica cuando showIva es verdadero)
  const subtotalSinIva = invoice.subtotalSinIvaNio ?? invoice.subtotalNio;
  const ivaTotal = invoice.ivaTotalNio ?? (subtotalSinIva * (invoice.ivaRate ?? 0));
  const totalConIva = invoice.totalConIvaNio ?? (invoice.totalNio || (subtotalSinIva + ivaTotal));

  // Cálculo de total ahorrado por promociones
  const totalSavedPromotion = fx((invoice.items || []).reduce((acc, item) => {
    const regularSinIva = item.regularPriceSinIvaNio ?? item.unitPriceSinIvaNio ?? item.unitPriceNio;
    const saleSinIva = item.unitPriceSinIvaNio ?? item.unitPriceNio;
    const diff = regularSinIva > saleSinIva ? (regularSinIva - saleSinIva) * item.quantity : 0;
    return acc + diff + (item.discountNio || 0);
  }, 0) + (invoice.discountNio || 0));

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col max-h-[90vh]">
      {/* Barra de Acciones Superior (Oculta al imprimir) */}
      <div className={`${showToolbar ? 'flex' : 'hidden'} items-center justify-between px-6 py-3 bg-surface-soft border-b border-blue-900/15 print:hidden`}>
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-moss" />
          <span className="text-sm font-bold text-ink">Vista Previa de Factura Comercial (PDF)</span>
          <span className="font-mono text-xs bg-white border border-blue-900/15 px-2 py-0.5 rounded text-ink font-semibold">
            {invoice.invoiceNumber}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openWhatsapp(invoice.customerPhone, buildInvoiceMessage(invoice, storeSettings.storeName || 'Pajarita Store'))}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-md"
            title={invoice.customerPhone ? `Enviar resumen a ${invoice.customerPhone}` : 'Enviar resumen por WhatsApp (elija el contacto)'}
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
            <span>WhatsApp</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-moss hover:bg-moss-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-md shadow-moss/20"
          >
            <Printer className="w-4 h-4 text-mustard" />
            <span>Descargar / Imprimir en PDF</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-ink-muted hover:text-ink hover:bg-surface rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* DOCUMENTO DE FACTURA (Imprimible en Carta / A4) */}
      <div className="overflow-y-auto p-6 sm:p-10 bg-white text-slate-900 font-sans print:p-0 print:m-0 print:overflow-visible" id="printable-invoice">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* ========================================================================= */}
          {/* BLOQUE 1: ENCABEZADO DE PÁGINA (DATOS DE LA TIENDA Y CONSECUTIVO FISCAL) */}
          {/* ========================================================================= */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b-2 border-slate-900">
            {/* Datos de la Tienda */}
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#582452] text-[#EAA824] flex items-center justify-center font-black text-2xl tracking-wider shadow-md shrink-0">
                PS
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-slate-900 tracking-tight leading-none uppercase">
                  {storeSettings.storeName || 'Pajarita Store'}
                </h1>
                <p className="text-xs font-semibold text-amber-800 mt-0.5">Moda que vuela a ti • Prendas Importadas & Accesorios</p>
                <div className="text-[11px] text-slate-600 space-y-0.5 mt-2">
                  <p className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>{storeSettings.address || 'Bo. el Rodeo De la iglesia catolica 6 cuadras al lago'}</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>Celular / WhatsApp: {storeSettings.phoneWhatsapp || '+505 8658 1794'}{storeSettings.ruc ? ` • RUC: ${storeSettings.ruc}` : ''}</span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {storeSettings.email}
                    {storeSettings.website ? ` • ${storeSettings.website}` : ''}
                  </p>
                </div>
              </div>
            </div>

            {/* Identificación de Factura */}
            <div className="sm:text-right bg-slate-50 p-4 rounded-xl border border-slate-200 shrink-0">
              <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-500 block">
                Factura Comercial de Venta
              </span>
              <p className="font-mono text-xl font-extrabold text-slate-900 mt-0.5">
                {invoice.invoiceNumber}
              </p>
              <div className="text-xs text-slate-600 space-y-1 mt-2">
                <p>
                  <strong>Fecha de Emisión:</strong> {invoice.issueDate}
                </p>
                {invoice.dueDate && (
                  <p>
                    <strong>Vencimiento:</strong> {invoice.dueDate}
                  </p>
                )}
                <div className="pt-1 flex flex-wrap gap-1.5 justify-start sm:justify-end">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase ${
                      invoice.status === 'pagada'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : invoice.status === 'parcial'
                        ? 'bg-sky-100 text-sky-800 border border-sky-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {invoice.status === 'pagada' ? '✓ Pagada' : invoice.status === 'parcial' ? '• Abono Parcial' : '⏳ Cobro Pendiente'}
                  </span>

                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase ${
                      invoice.deliveryStatus === 'entregado'
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        : invoice.deliveryStatus === 'listo_entrega'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : invoice.deliveryStatus === 'en_transito'
                        ? 'bg-sky-100 text-sky-900 border border-sky-300'
                        : 'bg-slate-100 text-slate-800 border border-slate-300'
                    }`}
                  >
                    {invoice.deliveryStatus === 'entregado'
                      ? '✓ Entregado'
                      : invoice.deliveryStatus === 'listo_entrega'
                      ? '📦 Listo p/ Retiro'
                      : invoice.deliveryStatus === 'en_transito'
                      ? '✈️ En Tránsito'
                      : '⏳ Pedido Pendiente'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BLOQUE 2: DATOS DEL CLIENTE Y TÉRMINOS DE VENTA (2 COLUMNAS COMPACTAS) */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Columna Izquierda: Datos del Cliente */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center gap-1.5 pb-2 border-b border-slate-200 mb-2">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Datos del Cliente (Facturar a:)
                </span>
              </div>
              <div className="text-xs space-y-1 text-slate-700">
                <p className="font-bold text-sm text-slate-900">{invoice.customerName || 'Cliente General'}</p>
                <p>
                  <span className="text-slate-500">Cédula / RUC:</span>{' '}
                  <strong className="font-mono">{invoice.customerIdentification || 'N/A'}</strong>
                </p>
                <p>
                  <span className="text-slate-500">Teléfono / WhatsApp:</span> {invoice.customerPhone || 'N/A'}
                </p>
                <p>
                  <span className="text-slate-500">Dirección de Entrega:</span> {invoice.customerAddress || 'Retiro en Tienda'}
                </p>
              </div>
            </div>

            {/* Columna Derecha: Términos & Modalidad */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center gap-1.5 pb-2 border-b border-slate-200 mb-2">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Términos Fiscales & Entrega
                </span>
              </div>
              <div className="text-xs space-y-1 text-slate-700">
                <p className="flex justify-between">
                  <span className="text-slate-500">Modalidad de Venta:</span>
                  <strong className="capitalize text-slate-900">
                    {invoice.saleType === 'pedido' ? 'Bajo Pedido (Shein / Amazon)' : 'Venta Inmediata de Tienda'}
                  </strong>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-500">Estado de Entrega:</span>
                  <strong className="text-slate-900 capitalize font-bold">
                    {invoice.deliveryStatus === 'entregado'
                      ? `Entregado (${invoice.deliveryDate || invoice.issueDate})`
                      : invoice.deliveryStatus === 'listo_entrega'
                      ? 'Listo para Entrega / Retiro'
                      : invoice.deliveryStatus === 'en_transito'
                      ? `En Tránsito ${invoice.trackingRef ? `(${invoice.trackingRef})` : ''}`
                      : 'Pendiente de Importación'}
                  </strong>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-500">Condición de Pago:</span>
                  <strong className="capitalize text-slate-900">
                    {invoice.paymentTerm === 'credito' ? 'Al Crédito (Abonos en Cuotas)' : 'De Contado (Inmediato)'}
                  </strong>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-500">Método de Pago:</span>
                  <span className="font-medium text-slate-800">
                    {invoice.payments && invoice.payments.length > 0
                      ? invoice.payments[0].paymentMethod.replace(/_/g, ' ')
                      : 'Efectivo / Transferencia'}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-500">Moneda:</span>
                  <strong className="text-slate-900">NIO (Córdobas)</strong>
                </p>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BLOQUE 3: DETALLE DE ÍTEMS (PRECIO REGULAR SIN IVA, PRECIO VENTA SIN IVA, TOTAL LÍNEA) */}
          {/* ========================================================================= */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-white font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3 w-14 text-center">Foto</th>
                  <th className="p-3">Descripción del SKU</th>
                  <th className="p-3 text-right">{showIva ? 'P. Reg. (Sin IVA)' : 'P. Regular'}</th>
                  <th className="p-3 text-right">{showIva ? 'P. Venta (Sin IVA)' : 'P. Venta'}</th>
                  <th className="p-3 text-center">Cant.</th>
                  <th className="p-3 text-right font-bold">{showIva ? 'Total Línea (Sin IVA)' : 'Total Línea'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {invoice.items.map((item, idx) => {
                  const regularPriceSinIva = item.regularPriceSinIvaNio ?? (item.unitPriceSinIvaNio ?? item.unitPriceNio);
                  const salePriceSinIva = item.unitPriceSinIvaNio ?? item.unitPriceNio;
                  const isPromo = item.promoPriceSinIvaNio || regularPriceSinIva > salePriceSinIva;
                  const lineTotalSinIva = item.lineTotalSinIvaNio ?? ((salePriceSinIva * item.quantity) - (item.discountNio || 0));

                  return (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      {/* Miniatura de Imagen */}
                      <td className="p-2.5 text-center">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 mx-auto flex items-center justify-center">
                          {item.mainImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.mainImageUrl}
                              alt={item.productName || 'Prenda'}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Tag className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </td>

                      {/* Descripción del SKU */}
                      <td className="p-3">
                        <p className="font-bold text-slate-900 text-xs">{item.productName}</p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium mt-0.5">
                          <span className="font-mono">{item.skuCode}</span>
                          {item.size && <span>&bull; Talla: {item.size}</span>}
                          {item.colorName && <span>&bull; Color: {item.colorName}</span>}
                        </div>
                      </td>

                      {/* Precio Regular Sin IVA */}
                      <td className="p-3 text-right font-mono text-slate-500">
                        {formatNIO(fx(regularPriceSinIva))}
                      </td>

                      {/* Precio Venta Sin IVA */}
                      <td className="p-3 text-right">
                        <span className={`font-bold font-mono ${isPromo ? 'text-sky-700' : 'text-slate-900'}`}>
                          {formatNIO(fx(salePriceSinIva))}
                        </span>
                        {isPromo && (
                          <span className="block text-[9px] font-bold text-sky-600 uppercase">En Promo</span>
                        )}
                      </td>

                      {/* Cantidad */}
                      <td className="p-3 text-center font-bold font-mono">
                        {item.quantity}
                      </td>

                      {/* Total Línea Sin IVA */}
                      <td className="p-3 text-right font-bold font-mono text-slate-900">
                        {formatNIO(fx(lineTotalSinIva))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ========================================================================= */}
          {/* BLOQUE 4: RESUMEN FINANCIERO (SUBTOTAL SIN IVA + IVA 15% = TOTAL CON IVA) */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 pt-2">
            {/* Columna Izquierda: Comentario de Ahorro y Notas */}
            <div className="sm:col-span-7 space-y-3">
              {totalSavedPromotion > 0 && (
                <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-xl flex items-start gap-2.5">
                  <Sparkles className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-bold text-sky-900 block">
                      ¡Felicidades! Total Ahorrado por Promoción: {formatNIO(totalSavedPromotion)}
                    </span>
                    <p className="text-[11px] text-sky-700 mt-0.5">
                      {showIva
                        ? 'Esta factura refleja descuentos aplicados sobre los precios regulares de venta sin IVA.'
                        : 'Esta factura refleja descuentos aplicados sobre los precios regulares de venta.'}
                    </p>
                  </div>
                </div>
              )}

              {invoice.notes && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
                  <strong className="text-slate-900 block mb-0.5">Observaciones:</strong>
                  {invoice.notes}
                </div>
              )}

              {invoice.paymentTerm === 'credito' && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                  <strong className="block font-bold">Términos de Crédito:</strong>
                  <p className="text-[11px]">
                    Factura emitida al crédito con control de cuotas/abonos según calendario acordado.
                  </p>
                </div>
              )}
            </div>

            {/* Columna Derecha: Desglose Fiscal (Subtotal Sin IVA + IVA 15% = Total con IVA) */}
            <div className="sm:col-span-5 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
              {showIva ? (
                <>
                  <div className="flex justify-between py-1 border-b border-slate-200 text-slate-600">
                    <span>Subtotal (Sin IVA):</span>
                    <span className="font-mono font-bold text-slate-800">{formatNIO(subtotalSinIva)}</span>
                  </div>

                  {invoice.discountNio > 0 && (
                    <div className="flex justify-between py-1 border-b border-slate-200 text-emerald-700 font-medium">
                      <span>Descuento Global (Sin IVA):</span>
                      <span className="font-mono font-bold">-{formatNIO(invoice.discountNio)}</span>
                    </div>
                  )}

                  <div className="flex justify-between py-1 border-b border-slate-200 text-slate-600">
                    <span>IVA Fiscal (15%):</span>
                    <span className="font-mono font-bold text-slate-800">+{formatNIO(ivaTotal)}</span>
                  </div>

                  <div className="flex justify-between py-2 border-t-2 border-slate-900 text-sm font-extrabold text-slate-900">
                    <span>TOTAL CON IVA:</span>
                    <span className="font-mono text-base text-slate-900">{formatNIO(totalConIva)}</span>
                  </div>
                </>
              ) : (
                <>
                  {invoice.discountNio > 0 && (
                    <div className="flex justify-between py-1 border-b border-slate-200 text-emerald-700 font-medium">
                      <span>Descuentos aplicados:</span>
                      <span className="font-mono font-bold">-{formatNIO(fx(invoice.discountNio))}</span>
                    </div>
                  )}

                  <div className="flex justify-between py-2 border-t-2 border-slate-900 text-sm font-extrabold text-slate-900">
                    <span>TOTAL A PAGAR:</span>
                    <span className="font-mono text-base text-slate-900">{formatNIO(totalConIva)}</span>
                  </div>

                  <p className="text-[11px] text-slate-500 text-right">
                    Contribuyente en Régimen de Cuota Fija
                  </p>
                </>
              )}

              {/* Si es crédito, mostrar balance */}
              {invoice.paymentTerm === 'credito' && (
                <div className="pt-2 mt-2 border-t border-dashed border-slate-300 space-y-1 text-[11px]">
                  <div className="flex justify-between text-emerald-800 font-bold">
                    <span>Monto Abonado:</span>
                    <span className="font-mono">{formatNIO(invoice.amountPaidNio || 0)}</span>
                  </div>
                  <div className="flex justify-between text-amber-900 font-extrabold text-xs">
                    <span>Saldo Pendiente:</span>
                    <span className="font-mono">{formatNIO(invoice.balanceDueNio || 0)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pie de Página de la Factura */}
          <div className="pt-6 border-t border-slate-200 text-center text-[10px] text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700">
              ¡Gracias por preferir Pajarita Store! Calidad, estilo y las mejores prendas importadas.
            </p>
            <p>
              Garantía de 7 días por defectos de fábrica en prendas con su etiqueta original. No se realizan devoluciones en efectivo.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
