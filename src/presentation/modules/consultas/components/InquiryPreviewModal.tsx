'use client';

import React, { useState } from 'react';
import {
  ExternalLink,
  Copy,
  Check,
  Eye,
  RefreshCw,
  ShoppingBag,
  User,
  DollarSign,
  MessageCircle,
  AlertCircle,
  X,
} from 'lucide-react';
import { ProductInquiry } from '@/domain/productInquiries/types';
import { formatUSD, formatNIO, convertUsdToNio } from '@/domain/shared/utils/currencyFormatter';
import { buildWhatsappQuoteMessage, calculateMargin } from '@/domain/productInquiries/services/inquiryCalculator';
import { openWhatsapp } from '@/domain/shared/utils/whatsapp';
import { useToast } from '@/presentation/components/ui/Toast';

interface InquiryPreviewModalProps {
  inquiry: ProductInquiry | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (inquiry: ProductInquiry) => void;
  exchangeRate: number;
}

export function InquiryPreviewModal({
  inquiry,
  isOpen,
  onClose,
  onEdit,
  exchangeRate,
}: InquiryPreviewModalProps) {
  const toast = useToast();
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedQuote, setCopiedQuote] = useState(false);
  const [iframeKey, setIframeKey] = useState(1);
  const [iframeError, setIframeError] = useState(false);

  if (!isOpen || !inquiry) return null;

  const saleNio =
    inquiry.finalSalePriceNio ||
    convertUsdToNio(inquiry.finalSalePriceUsd || inquiry.estimatedSalePriceUsd, exchangeRate);
  const saleUsd =
    inquiry.finalSalePriceUsd ||
    (saleNio && exchangeRate ? Number((saleNio / exchangeRate).toFixed(2)) : inquiry.estimatedSalePriceUsd);
  const margin = calculateMargin(inquiry.totalCostUsd, saleUsd);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(inquiry.productUrl);
      setCopiedUrl(true);
      toast.success('Enlace copiado al portapapeles');
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      toast.error('No se pudo copiar el enlace');
    }
  };

  const handleCopyQuote = async () => {
    try {
      const msg = buildWhatsappQuoteMessage(inquiry, exchangeRate);
      await navigator.clipboard.writeText(msg);
      setCopiedQuote(true);
      toast.success('Mensaje de cotización copiado listo para WhatsApp');
      setTimeout(() => setCopiedQuote(false), 2000);
    } catch {
      toast.error('No se pudo copiar el mensaje');
    }
  };

  const handleSendWhatsapp = () => {
    const msg = buildWhatsappQuoteMessage(inquiry, exchangeRate);
    openWhatsapp(inquiry.customerPhone || '', msg);
  };

  const reloadIframe = () => {
    setIframeError(false);
    setIframeKey((prev) => prev + 1);
  };

  const isShein = inquiry.platform === 'shein';
  const isAmazon = inquiry.platform === 'amazon';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Vista previa de producto consultado"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#220B1F]/65 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-4xl bg-white border border-[#582452]/20 rounded-2xl shadow-2xl overflow-hidden z-10 my-4 text-[#220B1F] flex flex-col max-h-[92vh]">
        {/* Header Superior */}
        <div className="px-5 py-3.5 border-b border-[#582452]/10 bg-[#FAF5F7] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#EAA824] to-[#F59E0B] flex items-center justify-center text-[#260B22] shadow-sm shrink-0">
              <Eye className="w-4 h-4" />
            </div>
            <div className="overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm sm:text-base text-[#220B1F] truncate">
                  {inquiry.productTitle || `Consulta de ${inquiry.customerName}`}
                </span>
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                    isShein
                      ? 'bg-black text-white'
                      : isAmazon
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-purple-100 text-purple-900'
                  }`}
                >
                  {inquiry.platform}
                </span>
              </div>
              <p className="text-xs text-[#634E60] truncate">
                Solicitante: <strong className="text-[#220B1F]">{inquiry.customerName}</strong>
                {inquiry.skuId && ` • SKU: ${inquiry.skuId}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleCopyUrl}
              className="p-1.5 rounded-lg text-[#634E60] hover:text-[#220B1F] hover:bg-[#582452]/10 transition-colors"
              title="Copiar enlace"
            >
              {copiedUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
            <a
              href={inquiry.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-[#634E60] hover:text-[#220B1F] hover:bg-[#582452]/10 transition-colors"
              title="Abrir en pestaña nueva"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#634E60] hover:text-[#220B1F] hover:bg-[#582452]/10 transition-colors"
              aria-label="Cerrar vista previa"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Resumen de costos y cotización rápida */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 sm:px-5 bg-purple-50/50 border-b border-[#582452]/10 text-xs shrink-0">
          <div className="bg-white p-2 rounded-lg border border-[#582452]/10">
            <span className="text-[#634E60] block text-[10px] uppercase font-semibold">Costo Tienda</span>
            <span className="font-bold text-[#220B1F]">{formatUSD(inquiry.priceUsd)}</span>
            <span className="text-[10px] text-[#634E60] block">+ {formatUSD(inquiry.shippingCostUsd)} envío</span>
          </div>

          <div className="bg-white p-2 rounded-lg border border-[#582452]/10">
            <span className="text-[#634E60] block text-[10px] uppercase font-semibold">Costo Total</span>
            <span className="font-bold text-purple-900">{formatUSD(inquiry.totalCostUsd)}</span>
            <span className="text-[10px] text-[#634E60] block">en dólares</span>
          </div>

          <div className="bg-white p-2 rounded-lg border border-[#582452]/10">
            <span className="text-[#634E60] block text-[10px] uppercase font-semibold">Venta Estimada (0.8)</span>
            <span className="font-semibold text-amber-700">{formatUSD(inquiry.estimatedSalePriceUsd)}</span>
            <span className="text-[10px] text-[#634E60] block">{formatNIO(convertUsdToNio(inquiry.estimatedSalePriceUsd, exchangeRate))}</span>
          </div>

          <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-2 rounded-lg border border-amber-300">
            <span className="text-amber-900 block text-[10px] uppercase font-bold">Venta Final</span>
            <span className="font-black text-[#260B22] text-sm">{formatNIO(saleNio)}</span>
            <span className="text-[10px] font-bold text-amber-800 block">≈ {formatUSD(saleUsd)}</span>
          </div>
        </div>

        {/* Mini Browser Bar */}
        <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center gap-2 text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
          </div>
          <button
            onClick={reloadIframe}
            className="p-1 text-slate-500 hover:text-slate-800 rounded transition-colors"
            title="Recargar vista previa"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <div className="flex-1 bg-white border border-slate-300 rounded px-2.5 py-1 text-slate-600 truncate font-mono text-[11px] select-all flex items-center justify-between">
            <span className="truncate">{inquiry.productUrl}</span>
          </div>
          <a
            href={inquiry.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-900 hover:text-purple-700 bg-purple-100 hover:bg-purple-200 px-2 py-1 rounded transition-colors shrink-0"
          >
            <span>Abrir original</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Contenedor de Vista Previa / Iframe con fallback inteligente */}
        <div className="flex-1 min-h-[380px] max-h-[550px] relative bg-slate-50 overflow-hidden flex flex-col">
          {/* Aviso contextual cuando el sitio externo bloquea ser embebido */}
          <div className="bg-amber-50/90 border-b border-amber-200 px-4 py-2 text-[11px] text-amber-900 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="truncate">
                {isShein
                  ? 'Shein suele restringir la vista dentro de otras apps por seguridad. Si no carga abajo, usa el botón "Abrir en Shein".'
                  : isAmazon
                  ? 'Amazon restringe la vista embebida por seguridad. Usa el botón "Abrir en Amazon" para verlo directo.'
                  : 'Si el sitio web no permite vista previa embebida, ábrelo en pestaña nueva.'}
              </span>
            </div>
            <a
              href={inquiry.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-bold underline text-amber-950 hover:text-black shrink-0"
            >
              Abrir ahora
            </a>
          </div>

          <div className="flex-1 relative w-full h-full">
            <iframe
              key={iframeKey}
              src={inquiry.productUrl}
              title={`Vista previa ${inquiry.productTitle || inquiry.skuId}`}
              className="w-full h-full border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-popups"
              onError={() => setIframeError(true)}
            />
          </div>

          {inquiry.notes && (
            <div className="p-3 bg-white border-t border-[#582452]/10 text-xs text-[#220B1F] shrink-0">
              <span className="font-semibold text-[#634E60]">Notas / Talla / Color: </span>
              <span>{inquiry.notes}</span>
            </div>
          )}
        </div>

        {/* Footer con Acciones */}
        <div className="px-5 py-3.5 border-t border-[#582452]/10 bg-[#FAF5F7] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyQuote}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white border border-[#582452]/20 text-[#220B1F] hover:bg-slate-50 transition-colors shadow-xs"
            >
              {copiedQuote ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>¡Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#634E60]" />
                  <span>Copiar Cotización</span>
                </>
              )}
            </button>

            {inquiry.customerPhone && (
              <button
                type="button"
                onClick={handleSendWhatsapp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Enviar WhatsApp</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(inquiry);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl text-[#220B1F] hover:bg-[#582452]/10 transition-colors"
              >
                Editar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-[#EAA824] to-[#F59E0B] text-[#260B22] hover:brightness-105 shadow-sm transition-all"
            >
              Listo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
