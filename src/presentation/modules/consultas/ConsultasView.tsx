'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Plus,
  Eye,
  ExternalLink,
  Edit2,
  Trash2,
  Copy,
  Check,
  MessageCircle,
  HelpCircle,
  Sparkles,
  ShoppingBag,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  Filter,
  ArrowUpDown,
  Share2,
} from 'lucide-react';
import {
  ProductInquiry,
  ProductInquiryPlatform,
  ProductInquiryStatus,
  CreateInquiryInput,
  UpdateInquiryInput,
} from '@/domain/productInquiries/types';
import { inquiryStore } from '@/infrastructure/repositories/inquiryStore';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { formatUSD, formatNIO, convertUsdToNio } from '@/domain/shared/utils/currencyFormatter';
import { buildWhatsappQuoteMessage, calculateMargin } from '@/domain/productInquiries/services/inquiryCalculator';
import { openWhatsapp } from '@/domain/shared/utils/whatsapp';
import { StatCard } from '@/presentation/components/ui/StatCard';
import { ConfirmDialog } from '@/presentation/components/ui/ConfirmDialog';
import { useToast } from '@/presentation/components/ui/Toast';
import { InquiryFormModal } from './components/InquiryFormModal';
import { InquiryPreviewModal } from './components/InquiryPreviewModal';

type SortOption = 'reciente' | 'antiguo' | 'precio_desc' | 'precio_asc' | 'solicitante';

const STATUS_CONFIG: Record<
  ProductInquiryStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  pendiente: {
    label: 'Pendiente',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  cotizado: {
    label: 'Cotizado',
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
  aceptado: {
    label: 'Aceptado / Por pedir',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  descartado: {
    label: 'Descartado',
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  },
};

export function ConsultasView() {
  const toast = useToast();

  const [inquiries, setInquiries] = useState<ProductInquiry[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number>(36.80);
  const [loading, setLoading] = useState(true);

  // Filtros y búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<ProductInquiryStatus | 'todos'>('todos');
  const [selectedPlatform, setSelectedPlatform] = useState<ProductInquiryPlatform | 'todas'>('todas');
  const [sortOption, setSortOption] = useState<SortOption>('reciente');

  // Modales
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInquiry, setEditingInquiry] = useState<ProductInquiry | null>(null);

  const [previewInquiry, setPreviewInquiry] = useState<ProductInquiry | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Estado temporal de copia
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedSkuId, setCopiedSkuId] = useState<string | null>(null);

  // Carga inicial y reactividad
  useEffect(() => {
    const refresh = () => {
      setInquiries(inquiryStore.getAll());
      setExchangeRate(dataStore.getExchangeRate());
    };
    refresh();
    setLoading(false);

    const unsubscribeInquiries = inquiryStore.subscribe(refresh);
    const unsubscribeDataStore = dataStore.subscribe(refresh);

    return () => {
      unsubscribeInquiries();
      unsubscribeDataStore();
    };
  }, []);

  // Lista filtrada y ordenada
  const filteredInquiries = useMemo(() => {
    return inquiries
      .filter((item) => {
        // Filtro por estado
        if (selectedStatus !== 'todos' && item.status !== selectedStatus) {
          return false;
        }
        // Filtro por plataforma
        if (selectedPlatform !== 'todas' && item.platform !== selectedPlatform) {
          return false;
        }
        // Búsqueda por texto
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchCustomer = item.customerName.toLowerCase().includes(q);
          const matchSku = item.skuId.toLowerCase().includes(q);
          const matchTitle = (item.productTitle || '').toLowerCase().includes(q);
          const matchNotes = (item.notes || '').toLowerCase().includes(q);
          const matchPhone = (item.customerPhone || '').toLowerCase().includes(q);
          const matchUrl = item.productUrl.toLowerCase().includes(q);
          return matchCustomer || matchSku || matchTitle || matchNotes || matchPhone || matchUrl;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortOption === 'reciente') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (sortOption === 'antiguo') {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        if (sortOption === 'precio_desc') {
          const priceA = a.finalSalePriceNio || convertUsdToNio(a.finalSalePriceUsd || a.estimatedSalePriceUsd, exchangeRate);
          const priceB = b.finalSalePriceNio || convertUsdToNio(b.finalSalePriceUsd || b.estimatedSalePriceUsd, exchangeRate);
          return priceB - priceA;
        }
        if (sortOption === 'precio_asc') {
          const priceA = a.finalSalePriceNio || convertUsdToNio(a.finalSalePriceUsd || a.estimatedSalePriceUsd, exchangeRate);
          const priceB = b.finalSalePriceNio || convertUsdToNio(b.finalSalePriceUsd || b.estimatedSalePriceUsd, exchangeRate);
          return priceA - priceB;
        }
        if (sortOption === 'solicitante') {
          return a.customerName.localeCompare(b.customerName);
        }
        return 0;
      });
  }, [inquiries, searchQuery, selectedStatus, selectedPlatform, sortOption]);

  // Totales para métricas
  const stats = useMemo(() => {
    const total = inquiries.length;
    const pendientes = inquiries.filter((i) => i.status === 'pendiente').length;
    const cotizados = inquiries.filter((i) => i.status === 'cotizado').length;
    const aceptados = inquiries.filter((i) => i.status === 'aceptado').length;
    const totalValorNio = inquiries
      .filter((i) => i.status !== 'descartado')
      .reduce((acc, curr) => {
        const nio =
          curr.finalSalePriceNio ||
          convertUsdToNio(curr.finalSalePriceUsd || curr.estimatedSalePriceUsd, exchangeRate);
        return acc + nio;
      }, 0);
    const totalValorUsd = exchangeRate > 0 ? totalValorNio / exchangeRate : 0;

    return { total, pendientes, cotizados, aceptados, totalValorNio, totalValorUsd };
  }, [inquiries, exchangeRate]);

  // Handlers
  const handleOpenCreate = () => {
    setEditingInquiry(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (inquiry: ProductInquiry) => {
    setEditingInquiry(inquiry);
    setIsFormOpen(true);
  };

  const handleOpenPreview = (inquiry: ProductInquiry) => {
    setPreviewInquiry(inquiry);
    setIsPreviewOpen(true);
  };

  const handleSaveInquiry = (data: CreateInquiryInput | UpdateInquiryInput) => {
    try {
      if (editingInquiry) {
        inquiryStore.update(editingInquiry.id, data);
        toast.success('Consulta actualizada correctamente');
      } else {
        inquiryStore.create(data as CreateInquiryInput);
        toast.success('Consulta registrada con éxito');
      }
    } catch {
      toast.error('Ocurrió un error al guardar la consulta');
    }
  };

  const handleConfirmDelete = () => {
    if (!deletingId) return;
    try {
      const ok = inquiryStore.delete(deletingId);
      if (ok) {
        toast.success('Consulta eliminada del registro');
      } else {
        toast.error('No se pudo encontrar el registro');
      }
    } catch {
      toast.error('Error al eliminar la consulta');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyQuote = async (inquiry: ProductInquiry) => {
    try {
      const msg = buildWhatsappQuoteMessage(inquiry, exchangeRate);
      await navigator.clipboard.writeText(msg);
      setCopiedId(inquiry.id);
      toast.success('Cotización copiada para WhatsApp');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('No se pudo copiar la cotización');
    }
  };

  const handleCopySku = async (sku: string, id: string) => {
    try {
      await navigator.clipboard.writeText(sku);
      setCopiedSkuId(id);
      toast.success(`SKU "${sku}" copiado`);
      setTimeout(() => setCopiedSkuId(null), 2000);
    } catch {
      toast.error('No se pudo copiar el SKU');
    }
  };

  const handleStatusChange = (id: string, newStatus: ProductInquiryStatus) => {
    inquiryStore.updateStatus(id, newStatus);
    toast.success(`Estado actualizado a "${STATUS_CONFIG[newStatus].label}"`);
  };

  const formatDateShort = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('es-NI', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Encabezado y Métricas */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#220B1F] tracking-tight">
            Consultas de Productos
          </h1>
          <p className="text-xs sm:text-sm text-[#634E60] mt-0.5">
            Registro, cálculo de precios y cotizaciones rápidas para solicitudes de Shein y Amazon
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#EAA824] to-[#F59E0B] text-[#260B22] font-black text-xs sm:text-sm shadow-md shadow-amber-950/20 hover:brightness-105 active:scale-98 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Registrar Consulta</span>
        </button>
      </div>

      {/* Tarjetas de Estadísticas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Total Consultas"
          value={stats.total}
          subtitle={`${stats.cotizados} cotizadas`}
          icon={ShoppingBag}
          accentColor="indigo"
        />
        <StatCard
          title="Pendientes"
          value={stats.pendientes}
          subtitle="Por calcular o responder"
          icon={Clock}
          accentColor="mustard"
        />
        <StatCard
          title="Aceptadas"
          value={stats.aceptados}
          subtitle="Listas para ordenar"
          icon={CheckCircle2}
          accentColor="moss"
        />
        <StatCard
          title="En Cotizaciones"
          value={formatNIO(stats.totalValorNio)}
          subtitle={`≈ ${formatUSD(stats.totalValorUsd)}`}
          icon={DollarSign}
          accentColor="amber"
        />
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="erp-card p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Buscador */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#634E60] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por solicitante, SKU Shein, prenda, teléfono o enlace..."
              className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm bg-[#FAF5F7] border border-[#582452]/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EAA824] text-[#220B1F] placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#634E60] hover:text-[#220B1F]"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Filtro Plataforma */}
          <div className="flex items-center gap-2">
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value as any)}
              className="px-3 py-2 text-xs sm:text-sm bg-white border border-[#582452]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EAA824] text-[#220B1F]"
            >
              <option value="todas">Todas las tiendas</option>
              <option value="shein">Solo Shein</option>
              <option value="amazon">Solo Amazon</option>
              <option value="otro">Otras</option>
            </select>

            {/* Ordenar */}
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="px-3 py-2 text-xs sm:text-sm bg-white border border-[#582452]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EAA824] text-[#220B1F]"
            >
              <option value="reciente">Más recientes</option>
              <option value="antiguo">Más antiguos</option>
              <option value="precio_desc">Mayor precio venta</option>
              <option value="precio_asc">Menor precio venta</option>
              <option value="solicitante">Solicitante (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Chips de filtro por Estado */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#582452]/10 text-xs">
          <span className="text-[11px] font-semibold text-[#634E60] mr-1">Estado:</span>
          {(['todos', 'pendiente', 'cotizado', 'aceptado', 'descartado'] as const).map((st) => {
            const isSelected = selectedStatus === st;
            const count =
              st === 'todos'
                ? inquiries.length
                : inquiries.filter((i) => i.status === st).length;

            return (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-[#260B22] text-[#EAA824] shadow-xs'
                    : 'bg-[#FAF5F7] text-[#634E60] hover:bg-[#F4ECF1] hover:text-[#220B1F] border border-[#582452]/10'
                }`}
              >
                {st === 'todos' ? 'Todos' : STATUS_CONFIG[st].label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista de Registros */}
      {filteredInquiries.length === 0 ? (
        <div className="erp-card p-12 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-[#FAF5F7] border border-[#582452]/15 flex items-center justify-center text-[#582452] mb-3 shadow-xs">
            <HelpCircle className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-[#220B1F] mb-1">
            {searchQuery || selectedStatus !== 'todos' || selectedPlatform !== 'todas'
              ? 'No hay consultas que coincidan con los filtros'
              : 'Aún no tienes consultas registradas'}
          </h3>
          <p className="text-xs sm:text-sm text-[#634E60] max-w-md mb-5">
            {searchQuery || selectedStatus !== 'todos' || selectedPlatform !== 'todas'
              ? 'Intenta cambiar los términos de búsqueda o restablecer los filtros para ver otros resultados.'
              : 'Cuando un cliente te envíe capturas o enlaces de Shein o Amazon, regístralas aquí para calcular costos y precios de venta al instante.'}
          </p>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#EAA824] to-[#F59E0B] text-[#260B22] font-black text-xs shadow-sm hover:brightness-105 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Primera Consulta</span>
          </button>
        </div>
      ) : (
        <>
          {/* Vista Tabla Desktop */}
          <div className="hidden lg:block erp-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#FAF5F7] border-b border-[#582452]/10 text-[#634E60] font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Solicitante</th>
                    <th className="py-3 px-4">Tienda / SKU</th>
                    <th className="py-3 px-4">Enlace / Vista Previa</th>
                    <th className="py-3 px-4">Costos ($)</th>
                    <th className="py-3 px-4">Venta Estimada (0.8)</th>
                    <th className="py-3 px-4">Venta Final (C$)</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#582452]/10">
                  {filteredInquiries.map((inquiry) => {
                    const statusInfo = STATUS_CONFIG[inquiry.status];
                    const saleNio =
                      inquiry.finalSalePriceNio ||
                      convertUsdToNio(inquiry.finalSalePriceUsd || inquiry.estimatedSalePriceUsd, exchangeRate);
                    const saleUsd =
                      inquiry.finalSalePriceUsd ||
                      (saleNio && exchangeRate ? Number((saleNio / exchangeRate).toFixed(2)) : inquiry.estimatedSalePriceUsd);
                    const isShein = inquiry.platform === 'shein';
                    const isAmazon = inquiry.platform === 'amazon';

                    return (
                      <tr
                        key={inquiry.id}
                        className="hover:bg-[#FAF5F7]/70 transition-colors group"
                      >
                        {/* Solicitante */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#220B1F] text-sm flex items-center gap-1.5">
                            <span>{inquiry.customerName}</span>
                          </div>
                          {inquiry.customerPhone && (
                            <div className="text-[11px] text-[#634E60] flex items-center gap-1 mt-0.5">
                              <span>{inquiry.customerPhone}</span>
                              <button
                                onClick={() => openWhatsapp(inquiry.customerPhone || '', '')}
                                className="text-emerald-700 hover:text-emerald-800"
                                title="Abrir chat de WhatsApp"
                              >
                                <MessageCircle className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {formatDateShort(inquiry.createdAt)}
                          </span>
                        </td>

                        {/* Tienda & SKU */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
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
                          <div className="flex items-center gap-1 mt-1 font-mono text-[11px] font-semibold text-[#220B1F]">
                            <span className="truncate max-w-[120px]">{inquiry.skuId}</span>
                            <button
                              onClick={() => handleCopySku(inquiry.skuId, inquiry.id)}
                              className="text-slate-400 hover:text-slate-700 transition-colors p-0.5"
                              title="Copiar SKU"
                            >
                              {copiedSkuId === inquiry.id ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          {inquiry.productTitle && (
                            <p className="text-[11px] text-[#634E60] truncate max-w-[160px] mt-0.5">
                              {inquiry.productTitle}
                            </p>
                          )}
                        </td>

                        {/* Enlace y Vista Previa (Botoncito del Ojito) */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            {/* BOTONCITO DEL OJITO: Pop up de vista previa de la url en miniatura */}
                            <button
                              onClick={() => handleOpenPreview(inquiry)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-50 text-purple-900 hover:bg-purple-100 border border-purple-200 text-xs font-semibold transition-all shadow-2xs hover:shadow-xs group-hover:border-purple-300"
                              title="Ver en pop-up miniatura (Ojito)"
                            >
                              <Eye className="w-3.5 h-3.5 text-purple-700" />
                              <span>Vista previa</span>
                            </button>

                            {/* Enlace directo */}
                            <a
                              href={inquiry.productUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-[#220B1F] hover:bg-slate-100 transition-colors"
                              title="Abrir en pestaña nueva"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                          {inquiry.notes && (
                            <span className="text-[11px] text-[#634E60] block truncate max-w-[170px] mt-1" title={inquiry.notes}>
                              💬 {inquiry.notes}
                            </span>
                          )}
                        </td>

                        {/* Costos ($) */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#220B1F]">
                            Total: <span className="text-purple-950 font-black">{formatUSD(inquiry.totalCostUsd)}</span>
                          </div>
                          <div className="text-[10px] text-[#634E60] mt-0.5">
                            Prod: {formatUSD(inquiry.priceUsd)} + Env: {formatUSD(inquiry.shippingCostUsd)}
                          </div>
                        </td>

                        {/* Venta Estimada (0.8) */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-amber-900">
                            {formatUSD(inquiry.estimatedSalePriceUsd)}
                          </div>
                          <div className="text-[10px] text-[#634E60] mt-0.5">
                            {formatNIO(convertUsdToNio(inquiry.estimatedSalePriceUsd, exchangeRate))}
                          </div>
                        </td>

                        {/* Venta Final */}
                        <td className="py-3 px-4">
                          <div className="inline-block px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300">
                            <span className="font-black text-[#260B22] text-xs">
                              {formatNIO(saleNio)}
                            </span>
                            <span className="text-[10px] font-bold text-amber-800 block">
                              ≈ {formatUSD(saleUsd)}
                            </span>
                          </div>
                        </td>

                        {/* Estado */}
                        <td className="py-3 px-4">
                          <select
                            value={inquiry.status}
                            onChange={(e) => handleStatusChange(inquiry.id, e.target.value as ProductInquiryStatus)}
                            className={`text-[11px] font-bold px-2 py-1 rounded-lg border focus:outline-none cursor-pointer ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
                          >
                            <option value="pendiente">Pendiente</option>
                            <option value="cotizado">Cotizado</option>
                            <option value="aceptado">Aceptado</option>
                            <option value="descartado">Descartado</option>
                          </select>
                        </td>

                        {/* Acciones */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Copiar cotización para WhatsApp */}
                            <button
                              onClick={() => handleCopyQuote(inquiry)}
                              className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 transition-colors"
                              title="Copiar cotización para enviar por WhatsApp"
                            >
                              {copiedId === inquiry.id ? (
                                <Check className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Share2 className="w-4 h-4" />
                              )}
                            </button>

                            {/* Editar */}
                            <button
                              onClick={() => handleOpenEdit(inquiry)}
                              className="p-1.5 rounded-lg text-[#634E60] hover:text-[#220B1F] hover:bg-[#582452]/10 transition-colors"
                              title="Editar consulta"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            {/* Eliminar */}
                            <button
                              onClick={() => setDeletingId(inquiry.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Eliminar consulta"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Vista Tarjetas para Móvil / Tablet */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:hidden gap-3.5">
            {filteredInquiries.map((inquiry) => {
              const statusInfo = STATUS_CONFIG[inquiry.status];
              const saleNio =
                inquiry.finalSalePriceNio ||
                convertUsdToNio(inquiry.finalSalePriceUsd || inquiry.estimatedSalePriceUsd, exchangeRate);
              const saleUsd =
                inquiry.finalSalePriceUsd ||
                (saleNio && exchangeRate ? Number((saleNio / exchangeRate).toFixed(2)) : inquiry.estimatedSalePriceUsd);
              const isShein = inquiry.platform === 'shein';
              const isAmazon = inquiry.platform === 'amazon';

              return (
                <div key={inquiry.id} className="erp-card p-4 space-y-3 relative">
                  {/* Cabecera de la tarjeta */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            isShein
                              ? 'bg-black text-white'
                              : isAmazon
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-purple-100 text-purple-900'
                          }`}
                        >
                          {inquiry.platform}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {formatDateShort(inquiry.createdAt)}
                        </span>
                      </div>
                      <h4 className="font-bold text-[#220B1F] text-base mt-1">
                        {inquiry.customerName}
                      </h4>
                      {inquiry.customerPhone && (
                        <p className="text-xs text-[#634E60] flex items-center gap-1">
                          <span>{inquiry.customerPhone}</span>
                        </p>
                      )}
                    </div>

                    <select
                      value={inquiry.status}
                      onChange={(e) => handleStatusChange(inquiry.id, e.target.value as ProductInquiryStatus)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg border focus:outline-none cursor-pointer ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="cotizado">Cotizado</option>
                      <option value="aceptado">Aceptado</option>
                      <option value="descartado">Descartado</option>
                    </select>
                  </div>

                  {/* SKU y Prenda */}
                  <div className="bg-[#FAF5F7] p-2.5 rounded-xl border border-[#582452]/10 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#634E60] font-semibold">SKU Shein / ID:</span>
                      <div className="flex items-center gap-1 font-mono font-bold text-[#220B1F]">
                        <span>{inquiry.skuId}</span>
                        <button
                          onClick={() => handleCopySku(inquiry.skuId, inquiry.id)}
                          className="text-slate-400 hover:text-slate-700 p-0.5"
                          title="Copiar SKU"
                        >
                          {copiedSkuId === inquiry.id ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                    {inquiry.productTitle && (
                      <p className="text-slate-700 mt-1 truncate">
                        <strong>Prenda:</strong> {inquiry.productTitle}
                      </p>
                    )}
                    {inquiry.notes && (
                      <p className="text-slate-600 mt-1 italic">
                        💬 {inquiry.notes}
                      </p>
                    )}
                  </div>

                  {/* Desglose de Precios */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-[#634E60] uppercase block">Costo Total</span>
                      <span className="font-bold text-[#220B1F] block">{formatUSD(inquiry.totalCostUsd)}</span>
                      <span className="text-[9px] text-[#634E60]">P: ${inquiry.priceUsd} + E: ${inquiry.shippingCostUsd}</span>
                    </div>

                    <div className="p-2 rounded-lg bg-amber-50/60 border border-amber-200">
                      <span className="text-[10px] text-amber-900 uppercase block">Estimado (0.8)</span>
                      <span className="font-bold text-amber-900 block">{formatUSD(inquiry.estimatedSalePriceUsd)}</span>
                      <span className="text-[9px] text-amber-800">{formatNIO(convertUsdToNio(inquiry.estimatedSalePriceUsd, exchangeRate))}</span>
                    </div>

                    <div className="p-2 rounded-lg bg-gradient-to-r from-amber-100/60 to-orange-100/60 border-2 border-amber-400">
                      <span className="text-[10px] text-[#260B22] font-black uppercase block">Venta Final</span>
                      <span className="font-black text-[#260B22] block">{formatNIO(saleNio)}</span>
                      <span className="text-[9px] font-bold text-amber-900">≈ {formatUSD(saleUsd)}</span>
                    </div>
                  </div>

                  {/* Botones de acción inferior */}
                  <div className="pt-2 border-t border-[#582452]/10 flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5">
                      {/* Botoncito con el Ojito */}
                      <button
                        onClick={() => handleOpenPreview(inquiry)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-50 text-purple-900 hover:bg-purple-100 border border-purple-200 text-xs font-bold transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 text-purple-700" />
                        <span>Ver Pop-up</span>
                      </button>

                      <a
                        href={inquiry.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-slate-500 hover:text-[#220B1F] rounded-lg"
                        title="Abrir enlace original"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopyQuote(inquiry)}
                        className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Copiar cotización para WhatsApp"
                      >
                        {copiedId === inquiry.id ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Share2 className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        onClick={() => handleOpenEdit(inquiry)}
                        className="p-1.5 text-[#634E60] hover:text-[#220B1F] rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => setDeletingId(inquiry.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal Formulario de Creación / Edición */}
      <InquiryFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingInquiry(null);
        }}
        onSave={handleSaveInquiry}
        initialData={editingInquiry}
        exchangeRate={exchangeRate}
      />

      {/* Modal Ojito: Pop up de Vista Previa */}
      <InquiryPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewInquiry(null);
        }}
        inquiry={previewInquiry}
        onEdit={(inq) => handleOpenEdit(inq)}
        exchangeRate={exchangeRate}
      />

      {/* Diálogo de Confirmación de Borrado */}
      <ConfirmDialog
        isOpen={Boolean(deletingId)}
        title="¿Eliminar esta consulta de producto?"
        confirmLabel="Eliminar Consulta"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingId(null)}
      >
        <p className="text-xs sm:text-sm text-[#634E60]">
          Esta acción removerá la consulta del registro local. Si el cliente vuelve a preguntar, tendrás que registrarla nuevamente.
        </p>
      </ConfirmDialog>
    </div>
  );
}
