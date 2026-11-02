'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/presentation/components/ui/Modal';
import {
  ProductInquiry,
  ProductInquiryPlatform,
  ProductInquiryStatus,
  CreateInquiryInput,
  UpdateInquiryInput,
} from '@/domain/productInquiries/types';
import {
  calculateTotalCost,
  calculateEstimatedSalePrice,
  calculateMargin,
  detectPlatformFromUrl,
  extractSkuFromUrl,
} from '@/domain/productInquiries/services/inquiryCalculator';
import { formatUSD, formatNIO, convertUsdToNio } from '@/domain/shared/utils/currencyFormatter';
import { Sparkles, DollarSign, ArrowRight, Link as LinkIcon, ShoppingBag, User, Check, ExternalLink } from 'lucide-react';

interface InquiryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateInquiryInput | UpdateInquiryInput) => void;
  initialData?: ProductInquiry | null;
  exchangeRate: number;
}

export function InquiryFormModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  exchangeRate,
}: InquiryFormModalProps) {
  const isEditing = Boolean(initialData);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [productTitle, setProductTitle] = useState('');
  const [skuId, setSkuId] = useState('');
  const [platform, setPlatform] = useState<ProductInquiryPlatform>('shein');
  const [priceUsd, setPriceUsd] = useState<string>('0.00');
  const [shippingCostUsd, setShippingCostUsd] = useState<string>('0.00');
  const [finalSalePriceNio, setFinalSalePriceNio] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ProductInquiryStatus>('pendiente');

  // Errores de validación
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) {
      setCustomerName(initialData.customerName || '');
      setCustomerPhone(initialData.customerPhone || '');
      setProductUrl(initialData.productUrl || '');
      setProductTitle(initialData.productTitle || '');
      setSkuId(initialData.skuId || '');
      setPlatform(initialData.platform || 'shein');
      setPriceUsd(initialData.priceUsd ? String(initialData.priceUsd) : '0.00');
      setShippingCostUsd(initialData.shippingCostUsd ? String(initialData.shippingCostUsd) : '0.00');
      setFinalSalePriceNio(
        initialData.finalSalePriceNio
          ? String(initialData.finalSalePriceNio)
          : initialData.finalSalePriceUsd
          ? String(Number((initialData.finalSalePriceUsd * exchangeRate).toFixed(2)))
          : ''
      );
      setNotes(initialData.notes || '');
      setStatus(initialData.status || 'pendiente');
    } else {
      setCustomerName('');
      setCustomerPhone('');
      setProductUrl('');
      setProductTitle('');
      setSkuId('');
      setPlatform('shein');
      setPriceUsd('');
      setShippingCostUsd('0.00');
      setFinalSalePriceNio('');
      setNotes('');
      setStatus('pendiente');
    }
    setErrors({});
  }, [initialData, isOpen, exchangeRate]);

  // Cálculos en vivo
  const parsedPrice = parseFloat(priceUsd) || 0;
  const parsedShipping = parseFloat(shippingCostUsd) || 0;
  const totalCost = calculateTotalCost(parsedPrice, parsedShipping);
  const estimatedPriceUsd = calculateEstimatedSalePrice(totalCost);
  const totalCostNio = convertUsdToNio(totalCost, exchangeRate);
  const estimatedPriceNio = convertUsdToNio(estimatedPriceUsd, exchangeRate);

  // El usuario ingresa en Córdobas (C$) y se recalcula en Dólares ($)
  const parsedFinalNio = parseFloat(finalSalePriceNio) || estimatedPriceNio;
  const recalculatedFinalUsd =
    exchangeRate > 0 ? Number((parsedFinalNio / exchangeRate).toFixed(2)) : 0;
  const margin = calculateMargin(totalCost, recalculatedFinalUsd);

  // Al escribir la URL, auto-detectar plataforma y SKU si están vacíos
  const handleUrlChange = (newUrl: string) => {
    setProductUrl(newUrl);
    if (newUrl.trim()) {
      const detected = detectPlatformFromUrl(newUrl);
      setPlatform(detected);

      const extractedSku = extractSkuFromUrl(newUrl);
      if (extractedSku && (!skuId || skuId === 'SIN-SKU')) {
        setSkuId(extractedSku);
      }
    }
  };

  const handleApplyEstimated = () => {
    setFinalSalePriceNio(estimatedPriceNio.toFixed(2));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!customerName.trim()) {
      newErrors.customerName = 'Ingrese el nombre de la persona que solicita';
    }
    if (!productUrl.trim()) {
      newErrors.productUrl = 'Ingrese el enlace o URL del producto';
    } else if (!/^https?:\/\//i.test(productUrl.trim())) {
      newErrors.productUrl = 'El enlace debe comenzar con http:// o https://';
    }
    if (parsedPrice < 0) {
      newErrors.priceUsd = 'El precio en dólares no puede ser negativo';
    }
    if (parsedShipping < 0) {
      newErrors.shippingCostUsd = 'El costo de envío no puede ser negativo';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const payload: CreateInquiryInput = {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
      platform,
      productUrl: productUrl.trim(),
      productTitle: productTitle.trim() || undefined,
      skuId: skuId.trim() || extractSkuFromUrl(productUrl) || 'SIN-SKU',
      priceUsd: parsedPrice,
      shippingCostUsd: parsedShipping,
      finalSalePriceNio: parseFloat(finalSalePriceNio) || estimatedPriceNio,
      finalSalePriceUsd: recalculatedFinalUsd,
      exchangeRate,
      notes: notes.trim() || undefined,
      status,
    };

    onSave(payload);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar Consulta de Producto' : 'Registrar Nueva Consulta'}
      subtitle="Cotización rápida de prendas o artículos solicitados de Shein / Amazon"
      maxWidth="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="hidden sm:block text-xs text-[#634E60]">
            Tasa actual: <strong className="text-[#220B1F]">C$ {exchangeRate.toFixed(2)} / $1.00</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-[#634E60] hover:bg-[#582452]/10 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-[#EAA824] to-[#F59E0B] text-[#260B22] shadow-sm hover:brightness-105 active:scale-98 transition-all"
            >
              {isEditing ? 'Guardar Cambios' : 'Registrar Consulta'}
            </button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
        {/* Sección: Solicitante & Plataforma */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#220B1F] mb-1">
              Persona que lo solicita <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#634E60] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  if (errors.customerName) setErrors((prev) => ({ ...prev, customerName: '' }));
                }}
                placeholder="Ej. Valeria Mendoza o @usuario"
                className={`w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-[#FAF5F7] border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EAA824] text-[#220B1F] placeholder:text-slate-400 ${
                  errors.customerName ? 'border-red-400 bg-red-50/30' : 'border-[#582452]/20'
                }`}
              />
            </div>
            {errors.customerName && <p className="text-[11px] text-red-600 mt-1">{errors.customerName}</p>}
          </div>

          <div>
            <label className="block text-xs font-bold text-[#220B1F] mb-1">
              Teléfono / WhatsApp <span className="text-[10px] text-[#634E60] font-normal">(Opcional)</span>
            </label>
            <input
              type="text"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Ej. +505 8899 1234"
              className="w-full px-3 py-2 text-xs sm:text-sm bg-[#FAF5F7] border border-[#582452]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EAA824] text-[#220B1F] placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Sección: Link & SKU */}
        <div className="space-y-3 bg-[#F4ECF1]/50 p-4 rounded-xl border border-[#582452]/10">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-[#220B1F]">
                Link del producto <span className="text-red-500">*</span>
              </label>
              {productUrl && (
                <a
                  href={productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-semibold text-purple-900 hover:underline inline-flex items-center gap-1"
                >
                  <span>Probar enlace</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <div className="relative">
              <LinkIcon className="w-4 h-4 text-[#634E60] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="url"
                value={productUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://us.shein.com/..."
                className={`w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EAA824] text-[#220B1F] placeholder:text-slate-400 ${
                  errors.productUrl ? 'border-red-400 bg-red-50/30' : 'border-[#582452]/20'
                }`}
              />
            </div>
            {errors.productUrl && <p className="text-[11px] text-red-600 mt-1">{errors.productUrl}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#220B1F] mb-1">Tienda / Plataforma</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as ProductInquiryPlatform)}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-[#582452]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EAA824] text-[#220B1F]"
              >
                <option value="shein">Shein</option>
                <option value="amazon">Amazon</option>
                <option value="otro">Otra tienda</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#220B1F] mb-1">
                ID de SKU Shein / Código
              </label>
              <input
                type="text"
                value={skuId}
                onChange={(e) => setSkuId(e.target.value)}
                placeholder="Ej. 18492041 o B08N5WRWNW"
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-[#582452]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EAA824] text-[#220B1F] placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#220B1F] mb-1">
                Prenda / Título breve
              </label>
              <input
                type="text"
                value={productTitle}
                onChange={(e) => setProductTitle(e.target.value)}
                placeholder="Ej. Vestido floral corte A"
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-[#582452]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EAA824] text-[#220B1F] placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>

        {/* Sección: Precios y Cálculo Automatizado */}
        <div className="bg-gradient-to-br from-[#FAF5F7] via-white to-amber-50/40 p-4 rounded-2xl border border-amber-300/40 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#582452]/10">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h4 className="text-xs font-black uppercase tracking-wider text-[#260B22]">
              Costos y Cálculo de Precio de Venta
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#220B1F] mb-1">
                Precio en Dólares ($) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-[#634E60] text-xs">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceUsd}
                  onChange={(e) => setPriceUsd(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 text-xs sm:text-sm bg-white border border-[#582452]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EAA824] text-[#220B1F] font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#220B1F] mb-1">
                Costo de Envío / Flete en Dólares ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-[#634E60] text-xs">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={shippingCostUsd}
                  onChange={(e) => setShippingCostUsd(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 text-xs sm:text-sm bg-white border border-[#582452]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EAA824] text-[#220B1F] font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Tarjetas de Cálculo en Vivo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {/* Costo Total */}
            <div className="p-3 rounded-xl bg-purple-50/70 border border-[#582452]/15">
              <span className="text-[10px] font-bold text-[#634E60] uppercase block">Costo Total</span>
              <div className="text-base font-black text-purple-950 mt-0.5">{formatUSD(totalCost)}</div>
              <div className="text-[11px] text-[#634E60] mt-0.5">{formatNIO(totalCostNio)}</div>
            </div>

            {/* Precio Venta Estimado (costo / 0.8) */}
            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-300/60 relative">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-900 uppercase">Venta Estimada (Costo / 0.8)</span>
              </div>
              <div className="text-base font-black text-amber-950 mt-0.5">{formatNIO(estimatedPriceNio)}</div>
              <div className="text-[11px] text-amber-800 mt-0.5">{formatUSD(estimatedPriceUsd)}</div>
              <button
                type="button"
                onClick={handleApplyEstimated}
                className="mt-2 text-[10px] font-bold text-purple-900 bg-white border border-purple-200 hover:bg-purple-50 px-2 py-0.5 rounded-lg shadow-2xs transition-colors flex items-center gap-1"
                title="Copiar este valor al precio final en córdobas"
              >
                <span>Usar como precio final</span>
                <ArrowRight className="w-2.5 h-2.5" />
              </button>
            </div>

            {/* Precio Venta Final (Ingresado en Córdobas C$ por el usuario) */}
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-100/60 to-orange-100/60 border-2 border-[#EAA824]">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] font-black uppercase text-[#260B22]">
                  Precio Venta Final (C$)
                </label>
                <span className="text-[9px] bg-[#260B22] text-[#EAA824] px-1.5 py-0.5 rounded font-bold">
                  Córdobas
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-bold text-[#260B22] text-xs">C$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={finalSalePriceNio}
                  onChange={(e) => setFinalSalePriceNio(e.target.value)}
                  placeholder={estimatedPriceNio.toFixed(2)}
                  className="w-full pl-8 pr-2 py-1.5 text-sm bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#EAA824] text-[#260B22] font-black"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-bold text-amber-950 mt-1">
                <span>≈ {formatUSD(recalculatedFinalUsd)}</span>
                {margin.marginPercent > 0 && (
                  <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    +{margin.marginPercent}% ganancia
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sección: Notas & Estado */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#220B1F] mb-1">
              Notas / Especificaciones (Talla, Color, Observaciones)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Talla M, Color Negro, le interesa antes del viernes"
              className="w-full px-3 py-2 text-xs sm:text-sm bg-[#FAF5F7] border border-[#582452]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EAA824] text-[#220B1F] placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#220B1F] mb-1">Estado</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProductInquiryStatus)}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-[#FAF5F7] border border-[#582452]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EAA824] text-[#220B1F] font-medium"
            >
              <option value="pendiente">Pendiente</option>
              <option value="cotizado">Cotizado</option>
              <option value="aceptado">Aceptado / Por pedir</option>
              <option value="descartado">Descartado</option>
            </select>
          </div>
        </div>
      </form>
    </Modal>
  );
}
