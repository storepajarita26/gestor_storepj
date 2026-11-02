'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDeepLink } from '@/presentation/hooks/useDeepLink';
import {
  ShoppingBag,
  Plus,
  Truck,
  Search,
  Filter,
  Trash2,
  ReceiptText,
  ChevronDown,
  Check,
  Package,
  X,
  Edit3,
} from 'lucide-react';
import { StatusBadge } from '@/presentation/components/ui/StatusBadge';
import { Modal } from '@/presentation/components/ui/Modal';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { formatNIO, formatUSD } from '@/domain/shared/utils/currencyFormatter';
import { PurchaseOrder, PurchaseModality, PurchaseStatus, PurchaseItem, ImportExpense } from '@/domain/procurement/types';
import { ProductSku } from '@/domain/catalog/types';
import { prorateExpenses, calculateSuggestedPrice } from '@/domain/procurement/services/prorationService';
import { useToast } from '@/presentation/components/ui/Toast';

/** Estados de seguimiento que se cambian a mano (los de recepción los asigna Recepciones) */
const TRACKING_STATUSES: { value: PurchaseStatus; label: string }[] = [
  { value: 'comprado', label: 'Comprado' },
  { value: 'en_agencia_envio', label: 'En casillero / agencia USA' },
  { value: 'en_transito_nicaragua', label: 'En tránsito a Nicaragua' },
  { value: 'cancelado', label: 'Cancelado' },
];

const MAX_VISIBLE_SKUS = 40;

function normalizeText(text?: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

interface IndexedSku {
  sku: ProductSku;
  searchBlob: string;
}

interface PurchaseSkuSelectProps {
  indexedSkus: IndexedSku[];
  skuMap: Map<string, ProductSku>;
  selectedSkuId: string;
  onSelectSku: (sku: ProductSku) => void;
  defaultOpen?: boolean;
}

/**
 * Selector de SKU con buscador integrado, scroll interno y límite de nodos renderizados
 * para mantener fluidez aun con cientos de SKUs en el catálogo.
 */
function PurchaseSkuSelect({
  indexedSkus,
  skuMap,
  selectedSkuId,
  onSelectSku,
  defaultOpen = false,
}: PurchaseSkuSelectProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedSku = skuMap.get(selectedSkuId);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const { visibleSkus, totalMatches } = useMemo(() => {
    if (!isOpen) return { visibleSkus: [] as ProductSku[], totalMatches: indexedSkus.length };
    const trimmed = normalizeText(query.trim());
    if (!trimmed) {
      return {
        visibleSkus: indexedSkus.slice(0, MAX_VISIBLE_SKUS).map((entry) => entry.sku),
        totalMatches: indexedSkus.length,
      };
    }
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const matches: ProductSku[] = [];
    let count = 0;
    for (let i = 0; i < indexedSkus.length; i++) {
      const entry = indexedSkus[i];
      if (tokens.every((t) => entry.searchBlob.includes(t))) {
        count++;
        if (matches.length < MAX_VISIBLE_SKUS) {
          matches.push(entry.sku);
        }
      }
    }
    return { visibleSkus: matches, totalMatches: count };
  }, [indexedSkus, query, isOpen]);

  return (
    <div ref={containerRef} className={`relative flex-1 min-w-[220px] ${isOpen ? 'z-30' : 'z-10'}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full bg-white hover:bg-surface-soft border border-moss/20 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2 text-left transition-colors shadow-2xs"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-surface border border-moss/15 overflow-hidden shrink-0 flex items-center justify-center">
            {selectedSku?.mainImageUrl ? (
              <img
                src={selectedSku.mainImageUrl}
                alt={selectedSku.skuCode}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <Package className="w-4 h-4 text-ink-muted/50" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-xs font-extrabold text-moss bg-moss/10 px-1.5 py-0.5 rounded border border-moss/20">
                {selectedSku?.skuCode || 'Seleccionar SKU'}
              </span>
              {selectedSku?.size && (
                <span className="text-[10px] bg-surface border border-moss/15 text-ink px-1.5 py-0.5 rounded font-bold">
                  {selectedSku.size}
                </span>
              )}
              {selectedSku?.colorName && (
                <span className="text-[10px] text-ink-muted truncate">• {selectedSku.colorName}</span>
              )}
            </div>
            <p className="text-[11px] text-ink font-medium truncate mt-0.5">
              {selectedSku?.skuDescription || 'Haz clic para buscar SKU...'}
            </p>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-ink-muted shrink-0 transition-transform ${isOpen ? 'rotate-180 text-moss' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="mt-1.5 w-full bg-white border border-moss/25 rounded-2xl shadow-xl overflow-hidden">
          {/* Buscador de SKU */}
          <div className="p-2 bg-surface-soft border-b border-moss/10">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (visibleSkus[0]) {
                      onSelectSku(visibleSkus[0]);
                      setIsOpen(false);
                      setQuery('');
                    }
                  } else if (e.key === 'Escape') {
                    setIsOpen(false);
                  }
                }}
                placeholder="Buscar por código SKU-00001, descripción, talla o color..."
                className="w-full bg-white border border-moss/20 rounded-lg pl-8 pr-7 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-moss"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 text-ink-muted hover:text-ink p-0.5"
                  title="Limpiar búsqueda"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between px-1 pt-1 text-[10px] text-ink-muted">
              <span>
                {totalMatches > MAX_VISIBLE_SKUS
                  ? `Mostrando primeros ${MAX_VISIBLE_SKUS} de ${totalMatches} SKUs`
                  : `${totalMatches} SKU(s) encontrados`}
              </span>
              <span>Enter selecciona el primero</span>
            </div>
          </div>

          {/* Lista de SKUs con scroll interno */}
          <div className="max-h-52 overflow-y-auto overscroll-contain divide-y divide-moss/10 p-1">
            {visibleSkus.length === 0 ? (
              <div className="p-4 text-center text-xs text-ink-muted">
                No se encontraron SKUs para &quot;{query}&quot;.
              </div>
            ) : (
              visibleSkus.map((s) => {
                const isSelected = s.id === selectedSkuId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onSelectSku(s);
                      setIsOpen(false);
                      setQuery('');
                    }}
                    className={`w-full text-left p-2 rounded-xl flex items-center justify-between gap-2.5 transition-colors ${
                      isSelected ? 'bg-moss/10 text-moss' : 'hover:bg-surface text-ink'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-surface border border-moss/15 overflow-hidden shrink-0 flex items-center justify-center">
                        {s.mainImageUrl ? (
                          <img
                            src={s.mainImageUrl}
                            alt={s.skuCode}
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Package className="w-4 h-4 text-ink-muted/50" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-extrabold text-moss bg-moss/10 px-1.5 py-0.5 rounded border border-moss/20">
                            {s.skuCode}
                          </span>
                          {s.size && (
                            <span className="text-[10px] bg-surface border border-moss/15 text-ink px-1.5 py-0.5 rounded font-semibold">
                              Talla {s.size}
                            </span>
                          )}
                          {s.colorName && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-ink-muted">
                              {s.colorHex && (
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-moss/30"
                                  style={{ backgroundColor: s.colorHex }}
                                />
                              )}
                              {s.colorName}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-ink font-medium truncate mt-0.5">
                          {s.skuDescription || s.skuCode}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <span className="block text-[10px] text-ink-muted">Costo base</span>
                        <span className="text-xs font-bold text-ink font-mono">
                          {formatUSD(s.costPriceUsd || 0)}
                        </span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-moss shrink-0" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ComprasView() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [skus, setSkus] = useState<ProductSku[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  // Búsqueda global: ?q=<texto> llega ya filtrado
  useDeepLink('q', (q) => setSearchTerm(q));
  const [modalityFilter, setModalityFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(36.80);
  const [formError, setFormError] = useState('');
  const [lastAddedIdx, setLastAddedIdx] = useState<number | null>(null);
  const toast = useToast();

  const notifyResult = (res: { success: boolean; message: string; sync: string }, title: string) => {
    if (!res.success) toast.error(res.message, title);
    else if (res.sync === 'pending') toast.warning(res.message, title);
    else toast.success(res.message, title);
  };

  const handleChangeOrderStatus = async (order: PurchaseOrder, next: PurchaseStatus) => {
    if (next === order.status) return;
    if (next === 'cancelado' && !window.confirm(`¿Cancelar la orden ${order.orderNumber}? No se podrá recibir mercadería.`)) return;
    const res = await dataStore.updatePurchaseOrderStatus(order.id, next);
    notifyResult(res, res.success ? 'Orden actualizada' : 'No se pudo cambiar el estado');
  };

  // Modal Agregar Gasto a Orden Existente
  const [selectedOrderForExpense, setSelectedOrderForExpense] = useState<PurchaseOrder | null>(null);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseConcept, setExpenseConcept] = useState('Flete Aéreo MGA');
  const [expenseAmountUsd, setExpenseAmountUsd] = useState<number>(0);
  const [expenseAmountNio, setExpenseAmountNio] = useState<number>(0);
  const [expenseCurrency, setExpenseCurrency] = useState<'USD' | 'NIO'>('USD');
  const [expenseNotes, setExpenseNotes] = useState('');

  // Form State para Crear / Editar Orden
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierOrderId, setSupplierOrderId] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [modality, setModality] = useState<PurchaseModality>('simple');
  const [prorationMethod, setProrationMethod] = useState<'valor' | 'peso'>('valor');
  const [status, setStatus] = useState<PurchaseStatus>('comprado');
  const [selectedItems, setSelectedItems] = useState<{
    id?: string;
    skuId: string;
    quantity: number;
    costUsd: number;
    weightLbs?: number;
    modality?: PurchaseModality;
    orderRef?: string;
  }[]>([]);
  const [expenses, setExpenses] = useState<{ id?: string; concept: string; amountUsd: number }[]>([]);
  const [notes, setNotes] = useState('');

  const refreshData = () => {
    setOrders(dataStore.getPurchaseOrders());
    setSkus(dataStore.getAllSkus());
    setExchangeRate(dataStore.getExchangeRate());
  };

  useEffect(() => {
    refreshData();
    const unsub = dataStore.subscribe(refreshData);
    return unsub;
  }, []);

  // Índice precalculado O(1) y texto normalizado una sola vez para búsqueda instantánea
  const skuMap = useMemo(() => {
    const map = new Map<string, ProductSku>();
    for (let i = 0; i < skus.length; i++) {
      map.set(skus[i].id, skus[i]);
    }
    return map;
  }, [skus]);

  const indexedSkus = useMemo<IndexedSku[]>(() => {
    return skus.map((sku) => ({
      sku,
      searchBlob: normalizeText([sku.skuCode, sku.skuDescription, sku.size, sku.colorName].filter(Boolean).join(' ')),
    }));
  }, [skus]);

  const handleOpenCreateModal = () => {
    setEditingOrder(null);
    // Correlativo sugerido (editable); no se permiten números repetidos
    setOrderNumber(dataStore.getNextOrderNumber());
    setSupplierName('Shein USA');
    setFormError('');
    setSupplierOrderId('');
    setTrackingNumber('');
    setModality('simple');
    setProrationMethod('valor');
    setStatus('comprado');
    setSelectedItems([]);
    setLastAddedIdx(null);
    setExpenses([]);
    setNotes('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (order: PurchaseOrder) => {
    if (!dataStore.canEditPurchaseOrder(order)) {
      toast.warning('No se puede editar una orden que ya tiene mercadería recibida.', 'Orden no editable');
      return;
    }
    setEditingOrder(order);
    setOrderNumber(order.orderNumber);
    setSupplierName(order.supplierName || 'Shein USA');
    setFormError('');
    setSupplierOrderId(order.supplierOrderId || '');
    setTrackingNumber(order.trackingNumber || '');
    setModality(order.modality || 'simple');
    setProrationMethod(order.prorationMethod || 'valor');
    setStatus(order.status || 'comprado');
    setSelectedItems(
      (order.items || []).map((it) => ({
        id: it.id,
        skuId: it.skuId,
        quantity: it.quantityOrdered,
        costUsd: it.unitCostUsd,
        weightLbs: it.weightLbs ?? 0,
        modality: it.modality || order.modality || 'simple',
        orderRef: it.orderRef || '',
      }))
    );
    setLastAddedIdx(null);
    setExpenses(
      (order.expenses || []).map((exp) => ({
        id: exp.id,
        concept: exp.concept,
        amountUsd: exp.amountUsd,
      }))
    );
    setNotes(order.notes || '');
    setIsModalOpen(true);
  };

  const handleOpenExpenseModal = (order: PurchaseOrder) => {
    setSelectedOrderForExpense(order);
    setExpenseConcept('');
    setExpenseAmountUsd(0);
    setExpenseAmountNio(0);
    setExpenseCurrency('USD');
    setExpenseNotes('');
    setIsExpenseModalOpen(true);
  };

  const handleAddItemRow = () => {
    if (skus.length > 0) {
      setLastAddedIdx(selectedItems.length);
      setSelectedItems([
        ...selectedItems,
        {
          skuId: skus[0].id,
          quantity: 1,
          costUsd: skus[0].costPriceUsd || 0,
          weightLbs: 0,
          modality: modality,
          orderRef: '',
        },
      ]);
    }
  };

  const handleAddExpenseRow = () => {
    setExpenses([...expenses, { concept: '', amountUsd: 0 }]);
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber || selectedItems.length === 0) return;

    const activeRate = editingOrder?.exchangeRate || exchangeRate;

    const purchaseItems: PurchaseItem[] = selectedItems.map((it) => {
      const sku = skuMap.get(it.skuId);
      const unitCostNio = it.costUsd * activeRate;
      const itemModality = it.modality || modality;
      return {
        id: it.id || `pi-${Date.now()}-${Math.random().toString().slice(2, 6)}`,
        purchaseOrderId: editingOrder?.id || '',
        skuId: it.skuId,
        skuCode: sku?.skuCode || 'SKU-TEMP',
        productName: sku?.skuDescription || 'Producto',
        quantityOrdered: Number(it.quantity),
        quantityReceived: 0,
        weightLbs: Number(it.weightLbs || 0),
        unitCostUsd: Number(it.costUsd),
        unitCostNio: Number(unitCostNio.toFixed(2)),
        proratedExpenseNio: 0,
        totalLandedCostNio: Number(unitCostNio.toFixed(2)),
        suggestedSalePriceNio: calculateSuggestedPrice(unitCostNio, itemModality),
        receptionStatus: 'pendiente',
        modality: itemModality,
        orderRef: it.orderRef?.trim() || undefined,
      };
    });

    const importExpenses: ImportExpense[] = expenses
      .filter((exp) => exp.concept.trim() && Number(exp.amountUsd) > 0)
      .map((exp) => ({
        id: exp.id || `exp-${Date.now()}-${Math.random().toString().slice(2, 6)}`,
        purchaseOrderId: editingOrder?.id || '',
        concept: exp.concept.trim(),
        amountUsd: Number(exp.amountUsd),
        amountNio: Number((exp.amountUsd * activeRate).toFixed(2)),
      }));

    const proratedItems = prorateExpenses(purchaseItems, importExpenses, modality, prorationMethod);
    const totalCostUsd = selectedItems.reduce((acc, it) => acc + it.costUsd * it.quantity, 0);
    const totalCostNio = totalCostUsd * activeRate;
    const totalExpensesNio = importExpenses.reduce((acc, exp) => acc + exp.amountNio, 0);

    try {
      if (editingOrder) {
        dataStore.updatePurchaseOrder({
          ...editingOrder,
          exchangeRate: activeRate,
          orderNumber,
          supplierName,
          supplierOrderId,
          trackingNumber,
          modality,
          prorationMethod,
          status,
          totalCostUsd: Number(totalCostUsd.toFixed(2)),
          totalCostNio: Number(totalCostNio.toFixed(2)),
          totalImportExpensesNio: Number(totalExpensesNio.toFixed(2)),
          items: proratedItems,
          expenses: importExpenses,
          notes,
        });
        toast.success(`Orden ${orderNumber} actualizada correctamente.`, 'Orden editada');
      } else {
        dataStore.addPurchaseOrder({
          exchangeRate: activeRate,
          orderNumber,
          supplierName,
          supplierOrderId,
          trackingNumber,
          modality,
          prorationMethod,
          status,
          datePurchased: new Date().toISOString().split('T')[0],
          totalCostUsd: Number(totalCostUsd.toFixed(2)),
          totalCostNio: Number(totalCostNio.toFixed(2)),
          totalImportExpensesNio: Number(totalExpensesNio.toFixed(2)),
          items: proratedItems,
          expenses: importExpenses,
          notes,
        });
        toast.success(`Orden ${orderNumber} creada (tasa C$ ${activeRate.toFixed(2)}).`, 'Compra registrada');
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar la orden.');
      return;
    }

    setEditingOrder(null);
    setIsModalOpen(false);
  };

  const handleSaveAdditionalExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForExpense || !expenseConcept) return;

    let finalAmountUsd = expenseAmountUsd;
    let finalAmountNio = expenseAmountNio;

    if (expenseCurrency === 'USD') {
      finalAmountNio = Number((expenseAmountUsd * exchangeRate).toFixed(2));
    } else {
      finalAmountUsd = Number((expenseAmountNio / exchangeRate).toFixed(2));
    }

    const res = await dataStore.addExpenseToOrder(selectedOrderForExpense.id, {
      concept: expenseConcept,
      amountUsd: finalAmountUsd,
      amountNio: finalAmountNio,
      notes: expenseNotes,
    });
    notifyResult(res, res.success ? 'Gasto registrado' : 'Gasto no registrado');
    if (res.success) setIsExpenseModalOpen(false);
  };

  const filteredOrders = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return orders.filter((o) => {
      const matchesSearch =
        !q ||
        o.orderNumber.toLowerCase().includes(q) ||
        (o.trackingNumber || '').toLowerCase().includes(q) ||
        o.supplierName.toLowerCase().includes(q);
      const matchesModality = modalityFilter === 'all' || o.modality === modalityFilter;
      return matchesSearch && matchesModality;
    });
  }, [orders, searchTerm, modalityFilter]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-4">

        <button
          onClick={handleOpenCreateModal}
          className="flex items-center gap-2 bg-moss hover:bg-moss-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-moss/20"
        >
          <Plus className="w-4 h-4 text-mustard" />
          <span>Registrar Lote de Compra</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="erp-card p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-surface border border-moss/15 rounded-xl px-3 py-2 w-full sm:w-72 shadow-xs">
          <Search className="w-4 h-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Buscar por lote, tracking o tienda..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-xs text-ink placeholder-ink-muted focus:outline-none w-full"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Filter className="w-3.5 h-3.5 text-ink-muted" />
          <span className="text-ink-muted font-medium">Modalidad:</span>
          <select
            value={modalityFilter}
            onChange={(e) => setModalityFilter(e.target.value)}
            className="bg-surface border border-moss/15 text-ink rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-moss"
          >
            <option value="all">Todas las modalidades</option>
            <option value="simple">Stock Tienda (Simple)</option>
            <option value="especial">Bajo Pedido (Especial)</option>
            <option value="regalia">Regalía / Promoción</option>
          </select>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-5">
        {filteredOrders.length === 0 ? (
          <div className="erp-card p-8 text-center rounded-2xl">
            <ShoppingBag className="w-8 h-8 text-ink-muted mx-auto mb-2" />
            <p className="text-sm font-bold text-ink">No se encontraron órdenes de compra</p>
            <p className="text-xs text-ink-muted mt-1">Crea un nuevo lote para comenzar el seguimiento.</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div key={order.id} className="erp-card rounded-2xl p-5 hover:border-moss/30 transition-all shadow-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-moss/10">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-moss/10 border border-moss/20 text-moss mt-0.5">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-bold text-sm text-ink">{order.orderNumber}</h3>
                      <span className="text-xs font-bold text-moss bg-moss/10 px-2 py-0.5 rounded-md border border-moss/20">
                        {order.supplierName}
                      </span>
                      <StatusBadge status={order.modality} />
                      <StatusBadge status={order.status} />
                      {TRACKING_STATUSES.some((t) => t.value === order.status) && order.status !== 'cancelado' && (
                        <>
                          <label htmlFor={`status-${order.id}`} className="sr-only">Estado de la orden {order.orderNumber}</label>
                          <select
                            id={`status-${order.id}`}
                            value={order.status}
                            onChange={(e) => handleChangeOrderStatus(order, e.target.value as PurchaseStatus)}
                            className="bg-white border border-moss/20 rounded-lg px-2 py-1 text-xs font-semibold text-ink"
                            title="Actualizar el seguimiento de la orden"
                          >
                            {TRACKING_STATUSES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </>
                      )}
                      {dataStore.canEditPurchaseOrder(order) && (
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(order)}
                          className="inline-flex items-center gap-1.5 bg-white hover:bg-moss hover:text-white text-moss border border-moss/25 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-2xs"
                          title="Editar SKUs, cantidades, costos o datos de esta orden antes de recibirla"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar Orden</span>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-ink-muted mt-1 flex-wrap font-medium">
                      <span>Tracking: <strong className="font-mono text-ink">{order.trackingNumber || 'Sin Asignar'}</strong></span>
                      {order.supplierOrderId && <span>ID Pedido: <strong className="font-mono text-ink">{order.supplierOrderId}</strong></span>}
                      <span>Fecha Compra: {order.datePurchased}</span>
                      {order.exchangeRate ? <span>Tasa: C$ {order.exchangeRate.toFixed(2)}</span> : null}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 sm:gap-6 text-right flex-wrap">
                  <div>
                    <span className="text-[10px] text-ink-muted uppercase font-bold">Costo Productos (USD)</span>
                    <p className="text-sm font-bold text-ink">{formatUSD(order.totalCostUsd)}</p>
                    <span className="text-[11px] text-ink-muted">({formatNIO(order.totalCostNio)})</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-muted uppercase font-bold">Gastos & Fletes ({order.expenses?.length || 0})</span>
                    <p className="text-sm font-bold text-amber-800">{formatNIO(order.totalImportExpensesNio)}</p>
                    <button
                      onClick={() => handleOpenExpenseModal(order)}
                      className="text-[11px] text-moss hover:underline font-bold flex items-center gap-1 mt-0.5 justify-end"
                      title="Agregar gastos de flete/aduana posteriores"
                    >
                      <Plus className="w-3 h-3" /> Agregar Gasto
                    </button>
                  </div>
                  <div className="pl-4 border-l border-moss/10">
                    <span className="text-[10px] text-moss uppercase font-bold">Costo Final Aterrizado</span>
                    <p className="text-base font-extrabold text-ink">
                      {formatNIO(order.totalCostNio + (order.totalImportExpensesNio || 0))}
                    </p>
                  </div>
                </div>
              </div>

              {/* Expenses Breakdown if any */}
              {order.expenses && order.expenses.length > 0 && (
                <div className="my-3 p-3 bg-surface rounded-xl border border-moss/10 text-xs">
                  <div className="flex items-center justify-between font-bold text-ink-muted mb-1.5">
                    <span className="flex items-center gap-1.5 text-[11px]">
                      <ReceiptText className="w-3.5 h-3.5 text-moss" />
                      Gastos Asociados al Lote (Prorrateados en tiempo real):
                    </span>
                    <button
                      onClick={() => handleOpenExpenseModal(order)}
                      className="text-moss hover:text-moss-800 text-[11px] font-bold"
                    >
                      + Añadir Otro Gasto de Retiro
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {order.expenses.map((exp) => (
                      <span key={exp.id} className="bg-white border border-moss/15 px-2.5 py-1 rounded-lg text-ink text-[11px] shadow-xs">
                        <strong>{exp.concept}:</strong> {formatNIO(exp.amountNio)} {exp.amountUsd > 0 && `(${formatUSD(exp.amountUsd)})`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Items Breakdown Table */}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-ink-muted border-b border-moss/10 pb-2">
                      <th className="pb-2 font-bold">SKU</th>
                      <th className="pb-2 font-bold text-center">Cant. Pedida</th>
                      <th className="pb-2 font-bold text-right">Costo Base Unit.</th>
                      <th className="pb-2 font-bold text-right">Flete Prorrateado</th>
                      <th className="pb-2 font-bold text-right text-moss-800">Costo Final Aterrizado</th>
                      <th className="pb-2 font-bold text-right text-emerald-800">Precio Venta Sugerido</th>
                      <th className="pb-2 font-bold text-center">Estado Item</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-moss/10">
                    {order.items.map((it) => {
                      const skuInfo = skuMap.get(it.skuId);
                      const imgUrl = it.mainImageUrl || skuInfo?.mainImageUrl;
                      const skuDesc = skuInfo?.skuDescription || it.productName;
                      return (
                        <tr key={it.id} className="text-ink">
                          <td className="py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-lg bg-surface border border-moss/15 overflow-hidden shrink-0 flex items-center justify-center">
                                {imgUrl ? (
                                  <img
                                    src={imgUrl}
                                    alt={it.skuCode || 'SKU'}
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <Package className="w-4 h-4 text-ink-muted/50" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono text-[11px] font-extrabold text-moss bg-moss/10 px-1.5 py-0.5 rounded border border-moss/20 inline-block">
                                    {it.skuCode || skuInfo?.skuCode}
                                  </span>
                                  {(it.modality || order.modality) === 'especial' ? (
                                    <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 shadow-2xs">
                                      📦 Bajo Pedido{it.orderRef ? `: ${it.orderRef}` : ''}
                                    </span>
                                  ) : (it.modality || order.modality) === 'regalia' ? (
                                    <span className="text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 shadow-2xs">
                                      🎁 Regalía
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 shadow-2xs">
                                      🏪 Stock Tienda
                                    </span>
                                  )}
                                </div>
                                {skuDesc && (
                                  <p className="font-semibold text-ink text-xs mt-0.5 truncate max-w-xs" title={skuDesc}>
                                    {skuDesc}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 text-center font-bold">{it.quantityOrdered} unids.</td>
                          <td className="py-2.5 text-right">{formatUSD(it.unitCostUsd)} ({formatNIO(it.unitCostNio)})</td>
                          <td className="py-2.5 text-right text-amber-800 font-medium">+{formatNIO(it.proratedExpenseNio)}</td>
                          <td className="py-2.5 text-right font-bold text-moss-800">{formatNIO(it.totalLandedCostNio)}</td>
                          <td className="py-2.5 text-right font-bold text-emerald-700">{formatNIO(it.suggestedSalePriceNio)}</td>
                          <td className="py-2.5 text-center"><StatusBadge status={it.receptionStatus} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Registrar Gasto Posterior a Orden Existente */}
      <Modal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        title={`Agregar Gasto de Importación / Retiro a ${selectedOrderForExpense?.orderNumber}`}
        subtitle="Registra gastos que conoces al retirar el paquete en Nicaragua (flete aéreo final, trámite aduana, delivery). El prorrateo y precios se actualizarán automáticamente."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveAdditionalExpense} className="space-y-4">
          <div>
            <label className="text-[11px] font-bold text-ink-muted block mb-1">Concepto del Gasto *</label>
            <input
              type="text"
              required
              placeholder="Ej: Flete Aéreo Casillero, Trámite Aduanal, Delivery Managua"
              value={expenseConcept}
              onChange={(e) => setExpenseConcept(e.target.value)}
              className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1">Moneda del Pago</label>
              <select
                value={expenseCurrency}
                onChange={(e) => setExpenseCurrency(e.target.value as any)}
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
              >
                <option value="USD">Dólares (USD)</option>
                <option value="NIO">Córdobas (NIO)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1">
                Monto ({expenseCurrency}) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={expenseCurrency === 'USD' ? expenseAmountUsd : expenseAmountNio}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  if (expenseCurrency === 'USD') {
                    setExpenseAmountUsd(val);
                    setExpenseAmountNio(val * exchangeRate);
                  } else {
                    setExpenseAmountNio(val);
                    setExpenseAmountUsd(val / exchangeRate);
                  }
                }}
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink font-bold text-moss focus:outline-none focus:border-moss"
              />
            </div>
          </div>

          <div className="p-3 bg-mustard/20 border border-mustard/40 rounded-xl text-xs text-moss-950 font-medium">
            <span className="font-bold block mb-0.5">Equivalencia y Prorrateo Automático:</span>
            Monto: <strong>{formatUSD(expenseAmountUsd)}</strong> = <strong>{formatNIO(expenseAmountNio)}</strong> (Tasa: C$ {exchangeRate.toFixed(2)}).
            Al guardar, se redistribuirá entre los {selectedOrderForExpense?.items.length || 0} ítems de la orden proporcionalmente a su valor.
          </div>

          <div>
            <label className="text-[11px] font-bold text-ink-muted block mb-1">Notas / Factura de Flete</label>
            <input
              type="text"
              placeholder="Ej: Factura de Agencia de Envío #4928"
              value={expenseNotes}
              onChange={(e) => setExpenseNotes(e.target.value)}
              className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink"
            />
          </div>

          <div className="pt-4 border-t border-moss/10 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-moss hover:bg-moss-700 text-white shadow-md shadow-moss/20"
            >
              Guardar Gasto y Recalcular Prorrateo
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Crear / Editar Orden Completa */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setEditingOrder(null);
          setIsModalOpen(false);
        }}
        title={
          editingOrder
            ? `Editar Orden de Compra: ${editingOrder.orderNumber}`
            : 'Registrar Nuevo Lote de Compra (Shein / Amazon / Proveedor)'
        }
        subtitle={
          editingOrder
            ? 'Modifica los SKUs, cantidades, costos o datos de envío mientras la orden no haya sido recibida en bodega.'
            : 'Ingresa los SKUs comprados y su costo base. Los gastos de flete y tránsito pueden registrarse ahora o al momento de la recepción.'
        }
        maxWidth="4xl"
      >
        <form onSubmit={handleCreateOrder} className="flex flex-col max-h-[75vh]">
          <div className="space-y-4 overflow-y-auto pr-1">
            {formError && (
              <p role="alert" className="p-3 rounded-xl border border-rose-300 bg-rose-50 text-sm text-rose-900">{formError}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-bold text-ink-muted block mb-1">Código de Lote *</label>
                <input
                  type="text"
                  required
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-ink-muted block mb-1">Proveedor *</label>
                <select
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
                >
                  <option value="Shein USA">Shein USA</option>
                  <option value="Amazon USA">Amazon USA</option>
                  <option value="Proveedor Local">Proveedor Local</option>
                  <option value="AliExpress">AliExpress</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-ink-muted block mb-1">Modalidad de Compra *</label>
                <select
                  value={modality}
                  onChange={(e) => setModality(e.target.value as PurchaseModality)}
                  className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
                >
                  <option value="simple">Stock Tienda (Margen 30%/40%)</option>
                  <option value="especial">Bajo Pedido (Margen 25%)</option>
                  <option value="regalia">Regalía / Promo (C$ 0.00)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-ink-muted block mb-1">Método de Prorrateo</label>
                <select
                  value={prorationMethod}
                  onChange={(e) => setProrationMethod(e.target.value as any)}
                  className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink font-semibold focus:outline-none focus:border-moss"
                >
                  <option value="valor">Por Valor Compra ($)</option>
                  <option value="peso">Por Peso (Libras)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-ink-muted block mb-1">ID Rastreo / Tracking USA</label>
                <input
                  type="text"
                  placeholder="Ej: TBA309482910..."
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-ink-muted block mb-1">ID Pedido Shein / Amazon</label>
                <input
                  type="text"
                  placeholder="Ej: GSHM928374..."
                  value={supplierOrderId}
                  onChange={(e) => setSupplierOrderId(e.target.value)}
                  className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
                />
              </div>
            </div>

            {/* Items selection */}
            <div className="pt-2 border-t border-moss/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-ink">
                  SKUs del Pedido ({selectedItems.length}) {prorationMethod === 'peso' ? '(Especifica peso en libras para prorrateo exacto)' : ''}
                </span>
                <button
                  type="button"
                  onClick={handleAddItemRow}
                  className="text-xs text-moss hover:text-moss-800 font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar SKU
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto overscroll-contain pr-1">
                {selectedItems.map((item, idx) => (
                  <div key={idx} className="flex flex-wrap sm:flex-nowrap items-start gap-2 bg-surface p-2 rounded-xl border border-moss/15">
                    <PurchaseSkuSelect
                      indexedSkus={indexedSkus}
                      skuMap={skuMap}
                      selectedSkuId={item.skuId}
                      defaultOpen={lastAddedIdx === idx}
                      onSelectSku={(selected) => {
                        const updated = [...selectedItems];
                        updated[idx] = {
                          ...updated[idx],
                          skuId: selected.id,
                          costUsd: selected.costPriceUsd || 5.0,
                        };
                        setSelectedItems(updated);
                        if (lastAddedIdx === idx) setLastAddedIdx(null);
                      }}
                    />
                    <div className="flex items-center gap-1 pt-1">
                      <span className="text-[10px] text-ink-muted">Cant:</span>
                      <input
                        type="number"
                        min="1"
                        placeholder="Cant."
                        value={item.quantity}
                        onChange={(e) => {
                          const updated = [...selectedItems];
                          updated[idx].quantity = parseInt(e.target.value) || 1;
                          setSelectedItems(updated);
                        }}
                        className="w-16 bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink text-center"
                      />
                    </div>
                    {prorationMethod === 'peso' && (
                      <div className="flex items-center gap-1 pt-1">
                        <span className="text-[10px] text-ink-muted">Lb:</span>
                        <input
                          type="number"
                          step="0.05"
                          min="0.05"
                          placeholder="Libras"
                          value={item.weightLbs ?? 0.5}
                          onChange={(e) => {
                            const updated = [...selectedItems];
                            updated[idx].weightLbs = parseFloat(e.target.value) || 0.1;
                            setSelectedItems(updated);
                          }}
                          className="w-16 bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink text-center"
                          title="Peso unitario en libras"
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-xs text-ink pt-1">
                      <span>$</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Costo USD"
                        value={item.costUsd}
                        onChange={(e) => {
                          const updated = [...selectedItems];
                          updated[idx].costUsd = parseFloat(e.target.value) || 0;
                          setSelectedItems(updated);
                        }}
                        className="w-20 bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink text-right font-semibold"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <select
                        value={item.modality || modality}
                        onChange={(e) => {
                          const updated = [...selectedItems];
                          updated[idx].modality = e.target.value as PurchaseModality;
                          setSelectedItems(updated);
                        }}
                        className={`border rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none transition-colors ${
                          (item.modality || modality) === 'especial'
                            ? 'bg-amber-50 text-amber-900 border-amber-300'
                            : (item.modality || modality) === 'regalia'
                            ? 'bg-purple-50 text-purple-900 border-purple-300'
                            : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                        }`}
                        title="Tipo de compra para este SKU: Normal (Stock vitrina) o Bajo Pedido (Encargo)"
                      >
                        <option value="simple">🏪 Stock Normal</option>
                        <option value="especial">📦 Por Pedido (25%)</option>
                        <option value="regalia">🎁 Regalía ($0)</option>
                      </select>
                      {(item.modality || modality) === 'especial' && (
                        <input
                          type="text"
                          placeholder="Ref. Pedido o Cliente"
                          value={item.orderRef || ''}
                          onChange={(e) => {
                            const updated = [...selectedItems];
                            updated[idx].orderRef = e.target.value;
                            setSelectedItems(updated);
                          }}
                          className="w-32 bg-white border border-amber-300 rounded-lg px-2 py-1.5 text-xs text-ink placeholder-ink-muted/60"
                          title="Nombre de cliente o código de pedido al que va asignado este SKU"
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedItems(selectedItems.filter((_, i) => i !== idx))}
                      className="p-1.5 mt-1 text-ink-muted hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Eliminar fila"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Expenses */}
            <div className="pt-2 border-t border-moss/10">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="text-xs font-bold text-ink">Gastos de Flete y Tránsito (Opcional)</span>
                  <p className="text-[11px] text-ink-muted">
                    Si aún no conoces el costo de envío, déjalo vacío; podrás registrarlo y prorratearlo al momento de la recepción.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddExpenseRow}
                  className="text-xs text-moss hover:text-moss-800 font-bold flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar Gasto
                </button>
              </div>

              <div className="space-y-2 mt-2">
                {expenses.map((exp, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-surface p-2 rounded-xl border border-moss/15">
                    <input
                      type="text"
                      value={exp.concept}
                      onChange={(e) => {
                        const updated = [...expenses];
                        updated[idx].concept = e.target.value;
                        setExpenses(updated);
                      }}
                      className="flex-1 bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink"
                    />
                    <div className="flex items-center gap-1 text-xs text-ink">
                      <span>$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={exp.amountUsd}
                        onChange={(e) => {
                          const updated = [...expenses];
                          updated[idx].amountUsd = parseFloat(e.target.value) || 0;
                          setExpenses(updated);
                        }}
                        className="w-24 bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink text-right font-semibold"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpenses(expenses.filter((_, i) => i !== idx))}
                      className="p-1 text-ink-muted hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-moss/10 flex justify-end gap-3 bg-white sticky bottom-0 z-10">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                setEditingOrder(null);
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-moss hover:bg-moss-700 text-white shadow-md shadow-moss/20"
            >
              {editingOrder ? 'Guardar Cambios y Recalcular' : 'Guardar y Calcular Prorrateo'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
