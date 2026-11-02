'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CheckCircle2,
  Truck,
  ArrowRight,
  Trash2,
  Calculator,
  DollarSign,
  Scale,
  ImageOff,
  History,
  Search,
  RefreshCw,
  Eye,
  PackageCheck,
  Calendar,
} from 'lucide-react';
import { StatusBadge } from '@/presentation/components/ui/StatusBadge';
import { Modal } from '@/presentation/components/ui/Modal';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { formatNIO, formatUSD } from '@/domain/shared/utils/currencyFormatter';
import { PurchaseOrder, PurchaseItem, ReceptionItemStatus } from '@/domain/procurement/types';
import { KardexMovement } from '@/domain/inventory/types';
import { useToast } from '@/presentation/components/ui/Toast';

type SkuItem = ReturnType<typeof dataStore.getAllSkus>[number];
type ProrationMethod = 'valor' | 'peso';
type RecepcionSection = 'pendientes' | 'realizadas';

/** Decisión por ítem en esta recepción */
type LineDecision = 'recibir' | 'no_vino' | 'devuelto' | 'cancelado';
const CLOSED: ReceptionItemStatus[] = ['no_vino', 'devuelto', 'cancelado'];

const pendingQty = (it: PurchaseItem) =>
  CLOSED.includes(it.receptionStatus) ? 0 : Math.max(0, it.quantityOrdered - (it.quantityReceived || 0));

function SkuMiniThumb({ url, alt }: { url?: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="w-10 h-10 rounded-lg bg-moss/10 border border-moss/15 flex items-center justify-center shrink-0 text-ink-muted">
        <ImageOff className="w-4 h-4 opacity-60" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-10 h-10 rounded-lg object-cover border border-moss/20 shrink-0 bg-surface"
    />
  );
}

export function RecepcionesView() {
  const [activeSection, setActiveSection] = useState<RecepcionSection>('pendientes');
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [skus, setSkus] = useState<SkuItem[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [receptionMap, setReceptionMap] = useState<Record<string, { qty: number; decision: LineDecision }>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Estado para registro de gastos de flete/tránsito y prorrateo durante la recepción
  const [expenseConcept, setExpenseConcept] = useState('Flete Internacional / Courier');
  const [expenseCurrency, setExpenseCurrency] = useState<'USD' | 'NIO'>('USD');
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [itemWeights, setItemWeights] = useState<Record<string, number>>({});

  // Estado bajo demanda para consultar recepciones realizadas (no se carga hasta que el usuario entra/consulta)
  const [completedOrders, setCompletedOrders] = useState<PurchaseOrder[]>([]);
  const [hasQueriedCompleted, setHasQueriedCompleted] = useState(false);
  const [loadingCompleted, setLoadingCompleted] = useState(false);
  const [completedSource, setCompletedSource] = useState<'cloud' | 'local'>('local');
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyStatus, setHistoryStatus] = useState<'todos' | 'recibido_completo' | 'recibido_parcial'>('todos');
  const [historyLimit, setHistoryLimit] = useState<number>(25);

  // Detalle bajo demanda de una recepción específica
  const [detailOrder, setDetailOrder] = useState<PurchaseOrder | null>(null);
  const [detailMovements, setDetailMovements] = useState<KardexMovement[]>([]);
  const [loadingDetailMovements, setLoadingDetailMovements] = useState(false);

  const toast = useToast();

  const refreshData = () => {
    setOrders(dataStore.getPurchaseOrders());
    setSkus(dataStore.getAllSkus());
  };

  useEffect(() => {
    refreshData();
    const unsub = dataStore.subscribe(refreshData);
    return unsub;
  }, []);

  const handleConsultCompletedReceptions = useCallback(
    async (overrideLimit?: number) => {
      setLoadingCompleted(true);
      try {
        const res = await dataStore.queryCompletedReceptionsOnDemand({
          search: historySearch,
          dateFrom: historyDateFrom || undefined,
          dateTo: historyDateTo || undefined,
          statusFilter: historyStatus,
          limit: overrideLimit ?? historyLimit,
        });
        setCompletedOrders(res.orders);
        setCompletedSource(res.source);
        setHasQueriedCompleted(true);
      } finally {
        setLoadingCompleted(false);
      }
    },
    [historySearch, historyDateFrom, historyDateTo, historyStatus, historyLimit]
  );

  const handleOpenReceptionDetail = async (order: PurchaseOrder) => {
    setDetailOrder(order);
    setDetailMovements([]);
    setLoadingDetailMovements(true);
    try {
      const movs = await dataStore.getReceptionMovementsByOrderOnDemand(order.id);
      setDetailMovements(movs);
    } finally {
      setLoadingDetailMovements(false);
    }
  };

  const skuMap = useMemo(() => {
    const map = new Map<string, SkuItem>();
    for (const s of skus) {
      map.set(s.id, s);
      map.set(s.skuCode, s);
    }
    return map;
  }, [skus]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  const handleOpenInspection = (order: PurchaseOrder) => {
    setSelectedOrderId(order.id);
    // Se empieza con todo lo pendiente listo para recibir o ajustable por prenda
    const initialMap: Record<string, { qty: number; decision: LineDecision }> = {};
    const initialWeights: Record<string, number> = {};
    order.items.forEach((it) => {
      initialMap[it.id] = { qty: pendingQty(it), decision: 'recibir' };
      initialWeights[it.id] = it.weightLbs || 0.5;
    });
    setReceptionMap(initialMap);
    setItemWeights(initialWeights);
    setExpenseConcept('Flete Internacional / Courier');
    setExpenseCurrency('USD');
    setExpenseAmount('');
    setIsModalOpen(true);
  };

  const fillAllPending = () => {
    if (!selectedOrder) return;
    const next = { ...receptionMap };
    selectedOrder.items.forEach((it) => {
      next[it.id] = { qty: pendingQty(it), decision: 'recibir' };
    });
    setReceptionMap(next);
  };

  const clearAllPending = () => {
    if (!selectedOrder) return;
    const next = { ...receptionMap };
    selectedOrder.items.forEach((it) => {
      next[it.id] = { qty: 0, decision: 'recibir' };
    });
    setReceptionMap(next);
  };

  const handleChangeProrationMethod = (method: ProrationMethod) => {
    if (!selectedOrder) return;
    dataStore.updateOrderProrationSettings(selectedOrder.id, method, itemWeights);
    toast.info(
      `Costos recalculados prorrateando por ${method === 'peso' ? 'Peso (Lb)' : 'Valor ($)'}.`,
      'Prorrateo actualizado'
    );
  };

  const handleWeightChange = (itemId: string, weightVal: number) => {
    if (!selectedOrder) return;
    const updatedWeights = { ...itemWeights, [itemId]: weightVal };
    setItemWeights(updatedWeights);
    if (selectedOrder.prorationMethod === 'peso') {
      dataStore.updateOrderProrationSettings(selectedOrder.id, 'peso', updatedWeights);
    }
  };

  const handleAddExpenseAtReception = () => {
    if (!selectedOrder) return;
    const rawAmount = parseFloat(expenseAmount);
    if (!rawAmount || rawAmount <= 0) {
      toast.warning('Ingresa un monto mayor a 0 para registrar y prorratear el gasto.', 'Monto inválido');
      return;
    }
    const rate = selectedOrder.exchangeRate || dataStore.getExchangeRate();
    const amountUsd = expenseCurrency === 'USD' ? rawAmount : Number((rawAmount / rate).toFixed(2));
    const amountNio = expenseCurrency === 'NIO' ? rawAmount : Number((rawAmount * rate).toFixed(2));

    dataStore.addExpenseToOrder(selectedOrder.id, {
      purchaseOrderId: selectedOrder.id,
      concept: expenseConcept.trim() || 'Flete / Tránsito en Recepción',
      amountUsd,
      amountNio,
      notes: `Registrado en recepción (${new Date().toISOString().split('T')[0]})`,
    });

    setExpenseAmount('');
    toast.success(
      `Se agregaron ${formatNIO(amountNio)} (${formatUSD(amountUsd)}) y se prorrateó el costo en los SKUs.`,
      'Gasto prorrateado'
    );
  };

  const handleRemoveExpenseAtReception = (expenseId: string) => {
    if (!selectedOrder) return;
    dataStore.removeExpenseFromOrder(selectedOrder.id, expenseId);
    toast.info('Gasto eliminado y costos unitarios recalculados.', 'Prorrateo actualizado');
  };

  const handleConfirmReception = async () => {
    if (!selectedOrder) return;

    // Si el usuario dejó un monto escrito en el campo de gasto sin presionar "Agregar y Prorratear", lo aplicamos antes de recibir
    const pendingExpenseVal = parseFloat(expenseAmount);
    if (pendingExpenseVal && pendingExpenseVal > 0) {
      const rate = selectedOrder.exchangeRate || dataStore.getExchangeRate();
      const amountUsd = expenseCurrency === 'USD' ? pendingExpenseVal : Number((pendingExpenseVal / rate).toFixed(2));
      const amountNio = expenseCurrency === 'NIO' ? pendingExpenseVal : Number((pendingExpenseVal * rate).toFixed(2));
      dataStore.addExpenseToOrder(selectedOrder.id, {
        purchaseOrderId: selectedOrder.id,
        concept: expenseConcept.trim() || 'Flete / Tránsito en Recepción',
        amountUsd,
        amountNio,
        notes: `Registrado en recepción (${new Date().toISOString().split('T')[0]})`,
      });
      setExpenseAmount('');
    }

    const lines = selectedOrder.items
      .filter((it) => pendingQty(it) > 0)
      .map((it) => {
        const val = receptionMap[it.id] || { qty: 0, decision: 'recibir' as LineDecision };
        return {
          itemId: it.id,
          quantityNow: Math.min(val.qty, pendingQty(it)),
          status: val.decision === 'recibir' ? undefined : (val.decision as ReceptionItemStatus),
        };
      })
      .filter((l) => l.quantityNow > 0 || l.status);

    if (lines.length === 0) {
      toast.warning('Indique cuántas unidades llegaron o marque los ítems que no vinieron.', 'Nada que registrar');
      return;
    }

    setSaving(true);
    const res = await dataStore.receivePurchaseOrder(selectedOrder.id, lines);
    setSaving(false);
    if (!res.success) toast.error(res.message, 'Recepción no registrada');
    else if (res.sync === 'pending') toast.warning(res.message, 'Recepción registrada');
    else toast.success(res.message, 'Recepción registrada');
    if (res.success) {
      setIsModalOpen(false);
      if (hasQueriedCompleted) {
        void handleConsultCompletedReceptions();
      }
    }
  };

  const pendingReceptionOrders = orders.filter((o) => o.status !== 'recibido_completo' && o.status !== 'cancelado');

  const completedSummary = useMemo(() => {
    let totalUnitsReceived = 0;
    let totalFreightNio = 0;
    let totalLandedNio = 0;
    for (const ord of completedOrders) {
      totalUnitsReceived += (ord.items || []).reduce((acc, i) => acc + (i.quantityReceived || 0), 0);
      totalFreightNio += ord.totalImportExpensesNio || 0;
      totalLandedNio += (ord.totalCostNio || 0) + (ord.totalImportExpensesNio || 0);
    }
    return { totalUnitsReceived, totalFreightNio, totalLandedNio };
  }, [completedOrders]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Selector de sección: Pendientes vs Historial Bajo Demanda */}
      <div className="erp-card p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSection('pendientes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSection === 'pendientes'
                ? 'bg-moss text-white shadow-sm'
                : 'text-ink-muted hover:text-ink hover:bg-surface'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Recepciones Pendientes ({pendingReceptionOrders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('realizadas')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSection === 'realizadas'
                ? 'bg-moss text-white shadow-sm'
                : 'text-ink-muted hover:text-ink hover:bg-surface'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Recepciones Realizadas (Bajo Demanda)</span>
          </button>
        </div>

        <span className="text-[11px] text-ink-muted">
          {activeSection === 'pendientes'
            ? 'Lotes en tránsito o aduana pendientes de ingresar a bodega'
            : 'Consulta histórica bajo demanda sin afectar el rendimiento de operación'}
        </span>
      </div>

      {activeSection === 'pendientes' ? (
        /* Orders ready for reception */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {pendingReceptionOrders.length === 0 ? (
            <div className="col-span-2 erp-card p-8 text-center rounded-2xl">
              <CheckCircle2 className="w-10 h-10 text-moss mx-auto mb-2" />
              <p className="text-sm font-bold text-ink">Todos los lotes en tránsito han sido inspeccionados</p>
              <p className="text-xs text-ink-muted mt-1">No hay recepciones pendientes en aduana o bodega.</p>
            </div>
          ) : (
            pendingReceptionOrders.map((order) => (
              <div key={order.id} className="erp-card rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-moss/10">
                    <div>
                      <h3 className="font-bold text-sm text-ink">{order.orderNumber}</h3>
                      <span className="text-xs text-ink-muted font-mono">Tracking: {order.trackingNumber || 'N/A'}</span>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>

                  <div className="py-4 space-y-2 text-xs text-ink">
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Proveedor:</span>
                      <span className="font-bold text-ink">{order.supplierName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Fecha Compra:</span>
                      <span>{order.datePurchased}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Unidades:</span>
                      <span className="font-bold text-moss">
                        {order.items.reduce((acc, i) => acc + (i.quantityReceived || 0), 0)} de{' '}
                        {order.items.reduce((acc, i) => acc + i.quantityOrdered, 0)} recibidas
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Gastos de Flete / Tránsito:</span>
                      <span className="font-semibold text-amber-700">
                        {order.totalImportExpensesNio > 0
                          ? `${formatNIO(order.totalImportExpensesNio)} (${order.expenses.length} reg.)`
                          : 'Pendiente de registrar en recepción'}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-moss/10">
                      <span className="text-ink-muted">Valor Lote (con flete):</span>
                      <span className="font-extrabold text-ink">
                        {formatNIO(order.totalCostNio + (order.totalImportExpensesNio || 0))}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenInspection(order)}
                  className="w-full mt-2 flex items-center justify-center gap-2 bg-moss hover:bg-moss-700 text-white text-xs font-bold py-2.5 rounded-xl transition-all shadow-md shadow-moss/20"
                >
                  <span>Registrar Flete, Prorratear & Recibir</span>
                  <ArrowRight className="w-4 h-4 text-mustard" />
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Sección de Recepciones Realizadas (Consulta Bajo Demanda) */
        <div className="space-y-4">
          {/* Panel de filtros y disparo bajo demanda */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleConsultCompletedReceptions();
            }}
            className="erp-card p-4 rounded-2xl space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-4">
                <label className="text-[11px] font-bold text-ink-muted block mb-1">
                  Buscar por Orden, Proveedor, Tracking o SKU
                </label>
                <div className="flex items-center gap-2 bg-surface border border-moss/20 rounded-xl px-3 py-2">
                  <Search className="w-4 h-4 text-ink-muted shrink-0" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Ej. OC-0012, Shein, SKU-00160..."
                    className="bg-transparent text-xs text-ink placeholder-ink-muted focus:outline-none w-full"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-ink-muted block mb-1">Desde (Recepción)</label>
                <input
                  type="date"
                  value={historyDateFrom}
                  onChange={(e) => setHistoryDateFrom(e.target.value)}
                  className="w-full bg-surface border border-moss/20 rounded-xl px-2.5 py-2 text-xs text-ink focus:outline-none focus:border-moss"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-ink-muted block mb-1">Hasta (Recepción)</label>
                <input
                  type="date"
                  value={historyDateTo}
                  onChange={(e) => setHistoryDateTo(e.target.value)}
                  className="w-full bg-surface border border-moss/20 rounded-xl px-2.5 py-2 text-xs text-ink focus:outline-none focus:border-moss"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-ink-muted block mb-1">Estado</label>
                <select
                  value={historyStatus}
                  onChange={(e) =>
                    setHistoryStatus(e.target.value as 'todos' | 'recibido_completo' | 'recibido_parcial')
                  }
                  className="w-full bg-surface border border-moss/20 rounded-xl px-2.5 py-2 text-xs font-semibold text-ink focus:outline-none focus:border-moss"
                >
                  <option value="todos">Todos los recibidos</option>
                  <option value="recibido_completo">Recibido Completo</option>
                  <option value="recibido_parcial">Recibido Parcial</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={loadingCompleted}
                  className="w-full flex items-center justify-center gap-2 bg-moss hover:bg-moss-700 disabled:opacity-60 text-white text-xs font-bold py-2.5 px-3 rounded-xl transition-all shadow-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingCompleted ? 'animate-spin' : ''}`} />
                  <span>{loadingCompleted ? 'Consultando...' : 'Consultar'}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-moss/10 text-[11px] text-ink-muted">
              <div className="flex items-center gap-2">
                <span>Límite por consulta:</span>
                {[25, 50, 100].map((lim) => (
                  <button
                    key={lim}
                    type="button"
                    onClick={() => {
                      setHistoryLimit(lim);
                      if (hasQueriedCompleted) {
                        void handleConsultCompletedReceptions(lim);
                      }
                    }}
                    className={`px-2 py-0.5 rounded-md font-bold transition-colors ${
                      historyLimit === lim
                        ? 'bg-moss/15 text-moss-900 border border-moss/30'
                        : 'hover:bg-surface text-ink-muted'
                    }`}
                  >
                    {lim} reg.
                  </button>
                ))}
              </div>

              {hasQueriedCompleted && (
                <span>
                  Mostrando <strong>{completedOrders.length}</strong> recepción(es) · Origen:{' '}
                  <strong>{completedSource === 'cloud' ? 'Supabase + Local' : 'Memoria Local'}</strong>
                </span>
              )}
            </div>
          </form>

          {!hasQueriedCompleted ? (
            <div className="erp-card p-10 text-center rounded-2xl space-y-3">
              <PackageCheck className="w-10 h-10 text-moss mx-auto" />
              <div className="max-w-md mx-auto space-y-1">
                <p className="text-sm font-bold text-ink">Consulta de Recepciones Realizadas Bajo Demanda</p>
                <p className="text-xs text-ink-muted">
                  Para mantener el módulo rápido y ligero, el historial de órdenes recibidas solo se carga cuando lo solicitas. Puedes filtrar por fechas, proveedor o código SKU y presionar el botón.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleConsultCompletedReceptions()}
                disabled={loadingCompleted}
                className="inline-flex items-center gap-2 bg-moss hover:bg-moss-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-moss/20"
              >
                <History className="w-4 h-4 text-mustard" />
                <span>{loadingCompleted ? 'Cargando recepciones...' : 'Cargar Recepciones Realizadas'}</span>
              </button>
            </div>
          ) : (
            <>
              {/* Resumen de las recepciones consultadas */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="erp-card p-3.5 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-ink-muted block">Recepciones Consultadas</span>
                  <span className="text-lg font-extrabold text-ink tabular-nums">{completedOrders.length}</span>
                </div>
                <div className="erp-card p-3.5 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-ink-muted block">Prendas Recibidas</span>
                  <span className="text-lg font-extrabold text-moss tabular-nums">
                    {completedSummary.totalUnitsReceived} unids.
                  </span>
                </div>
                <div className="erp-card p-3.5 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-ink-muted block">Flete / Tránsito Prorrateado</span>
                  <span className="text-lg font-extrabold text-amber-700 tabular-nums">
                    {formatNIO(completedSummary.totalFreightNio)}
                  </span>
                </div>
                <div className="erp-card p-3.5 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-ink-muted block">Valor Total Landed</span>
                  <span className="text-lg font-extrabold text-ink tabular-nums">
                    {formatNIO(completedSummary.totalLandedNio)}
                  </span>
                </div>
              </div>

              {/* Tabla de recepciones realizadas */}
              <div className="erp-card rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-soft text-ink-muted border-b border-moss/10 font-bold">
                      <tr>
                        <th className="p-4">Orden / Tracking</th>
                        <th className="p-4">Proveedor</th>
                        <th className="p-4 text-center">Fecha Recepción</th>
                        <th className="p-4 text-center">Estado</th>
                        <th className="p-4 text-center">Unidades Recibidas</th>
                        <th className="p-4 text-right">Costo Base</th>
                        <th className="p-4 text-right">Flete Prorrateado</th>
                        <th className="p-4 text-right">Total Landed</th>
                        <th className="p-4 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-moss/10 text-ink">
                      {completedOrders.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-ink-muted">
                            No se encontraron recepciones realizadas con los filtros seleccionados.
                          </td>
                        </tr>
                      ) : (
                        completedOrders.map((ord) => {
                          const totalOrdered = (ord.items || []).reduce((acc, i) => acc + i.quantityOrdered, 0);
                          const totalReceived = (ord.items || []).reduce(
                            (acc, i) => acc + (i.quantityReceived || 0),
                            0
                          );
                          const totalLanded = (ord.totalCostNio || 0) + (ord.totalImportExpensesNio || 0);
                          return (
                            <tr key={ord.id} className="hover:bg-surface transition-colors">
                              <td className="p-4">
                                <span className="font-mono font-extrabold text-moss bg-moss/10 px-2 py-0.5 rounded border border-moss/20 inline-block">
                                  {ord.orderNumber}
                                </span>
                                {ord.trackingNumber && (
                                  <span className="block text-[11px] text-ink-muted font-mono mt-1">
                                    Trk: {ord.trackingNumber}
                                  </span>
                                )}
                              </td>
                              <td className="p-4 font-bold text-ink">{ord.supplierName}</td>
                              <td className="p-4 text-center">
                                <span className="inline-flex items-center gap-1 font-semibold text-ink">
                                  <Calendar className="w-3.5 h-3.5 text-moss" />
                                  {ord.dateReceivedNicaragua || ord.updatedAt?.split('T')[0] || ord.datePurchased}
                                </span>
                                <span className="block text-[10px] text-ink-muted">
                                  Compra: {ord.datePurchased}
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <StatusBadge status={ord.status} />
                              </td>
                              <td className="p-4 text-center">
                                <span className="font-bold text-moss tabular-nums">
                                  {totalReceived} / {totalOrdered} unids.
                                </span>
                                <span className="block text-[10px] text-ink-muted">
                                  {(ord.items || []).length} SKU(s)
                                </span>
                              </td>
                              <td className="p-4 text-right font-medium tabular-nums">
                                {formatNIO(ord.totalCostNio)}
                                <span className="block text-[10px] text-ink-muted">
                                  {formatUSD(ord.totalCostUsd)}
                                </span>
                              </td>
                              <td className="p-4 text-right font-semibold text-amber-800 tabular-nums">
                                +{formatNIO(ord.totalImportExpensesNio || 0)}
                                <span className="block text-[10px] text-ink-muted">
                                  {(ord.expenses || []).length} gasto(s) ·{' '}
                                  {ord.prorationMethod === 'peso' ? 'Por Peso' : 'Por Valor'}
                                </span>
                              </td>
                              <td className="p-4 text-right font-extrabold text-ink tabular-nums">
                                {formatNIO(totalLanded)}
                              </td>
                              <td className="p-4 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => void handleOpenReceptionDetail(ord)}
                                    className="inline-flex items-center gap-1 bg-white hover:bg-surface border border-moss/25 text-ink px-2.5 py-1.5 rounded-lg text-[11px] font-bold shadow-xs transition-all"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-moss" />
                                    <span>Ver Detalle</span>
                                  </button>
                                  {ord.status === 'recibido_parcial' && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenInspection(ord)}
                                      className="inline-flex items-center gap-1 bg-moss hover:bg-moss-700 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-bold shadow-xs transition-all"
                                      title="Recibir unidades pendientes de esta orden"
                                    >
                                      <span>Recibir Resto</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal de Inspección, Prorrateo de Flete y Recepción */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Recepción y Prorrateo de Lote: ${selectedOrder?.orderNumber}`}
        subtitle="Paso 1: Registra los gastos de flete/tránsito y prorratea el costo. Paso 2: Confirma las unidades recibidas en bodega."
        maxWidth="3xl"
      >
        {selectedOrder && (
          <div className="space-y-5">
            {/* PASO 1: GASTOS DE FLETE Y PRORRATEO */}
            <div className="p-4 rounded-2xl bg-moss/5 border border-moss/20 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-moss/15">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-moss text-white">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-ink">
                      Paso 1: Gastos de Flete / Tránsito y Prorrateo
                    </h4>
                    <p className="text-[11px] text-ink-muted">
                      Registra lo pagado en envío/aduana para distribuirlo en el costo unitario antes de ingresar a inventario.
                    </p>
                  </div>
                </div>

                {/* Selector de método de prorrateo */}
                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-moss/15 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleChangeProrationMethod('valor')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      selectedOrder.prorationMethod === 'valor'
                        ? 'bg-moss text-white shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    <DollarSign className="w-3 h-3" /> Por Valor ($)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChangeProrationMethod('peso')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      selectedOrder.prorationMethod === 'peso'
                        ? 'bg-moss text-white shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    <Scale className="w-3 h-3" /> Por Peso (Lb)
                  </button>
                </div>
              </div>

              {/* Formulario rápido para agregar gasto en recepción */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-white p-3 rounded-xl border border-moss/15">
                <div className="sm:col-span-5">
                  <label className="text-[11px] font-bold text-ink-muted block mb-1">
                    Concepto del Gasto (Flete, Courier, Aduana)
                  </label>
                  <input
                    type="text"
                    value={expenseConcept}
                    onChange={(e) => setExpenseConcept(e.target.value)}
                    placeholder="Ej. Flete Miami-Managua / Aduana"
                    className="w-full bg-surface border border-moss/20 rounded-lg px-2.5 py-1.5 text-xs text-ink font-medium focus:outline-none focus:border-moss"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-ink-muted block mb-1">Moneda</label>
                  <select
                    value={expenseCurrency}
                    onChange={(e) => setExpenseCurrency(e.target.value as 'USD' | 'NIO')}
                    className="w-full bg-surface border border-moss/20 rounded-lg px-2 py-1.5 text-xs font-bold text-ink focus:outline-none focus:border-moss"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="NIO">NIO (C$)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-ink-muted block mb-1">Monto</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddExpenseAtReception();
                      }
                    }}
                    className="w-full bg-surface border border-moss/20 rounded-lg px-2.5 py-1.5 text-xs text-ink font-bold tabular-nums focus:outline-none focus:border-moss"
                  />
                </div>
                <div className="sm:col-span-3">
                  <button
                    type="button"
                    onClick={handleAddExpenseAtReception}
                    className="w-full flex items-center justify-center gap-1.5 bg-moss hover:bg-moss-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-all shadow-xs"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    <span>Agregar y Prorratear</span>
                  </button>
                </div>
              </div>

              {/* Lista de gastos registrados en la orden */}
              {selectedOrder.expenses.length > 0 ? (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-ink-muted block">
                    Gastos aplicados al prorrateo ({selectedOrder.expenses.length}):
                  </span>
                  <div className="divide-y divide-moss/10 bg-white rounded-xl border border-moss/15 overflow-hidden">
                    {selectedOrder.expenses.map((exp) => (
                      <div key={exp.id} className="flex items-center justify-between px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink">{exp.concept}</span>
                          {exp.notes && <span className="text-[10px] text-ink-muted font-mono">({exp.notes})</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-ink-muted font-mono">{formatUSD(exp.amountUsd)}</span>
                          <span className="font-bold text-amber-800 tabular-nums">{formatNIO(exp.amountNio)}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveExpenseAtReception(exp.id)}
                            title="Quitar gasto y recalcular"
                            className="p-1 text-ink-muted hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-amber-800 bg-amber-50/80 border border-amber-200/80 rounded-xl px-3 py-2">
                  Aún no hay gastos de flete registrados en esta orden. Si pagaste envío o aduana, agrégalo arriba para prorratear el costo antes de recibir.
                </p>
              )}

              {/* Resumen financiero del lote */}
              <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                <div className="bg-white/90 p-2.5 rounded-xl border border-moss/10">
                  <span className="text-[10px] uppercase font-bold text-ink-muted block">Costo Base Prendas</span>
                  <span className="font-extrabold text-ink tabular-nums">{formatNIO(selectedOrder.totalCostNio)}</span>
                  <span className="text-[10px] text-ink-muted block">{formatUSD(selectedOrder.totalCostUsd)}</span>
                </div>
                <div className="bg-white/90 p-2.5 rounded-xl border border-moss/10">
                  <span className="text-[10px] uppercase font-bold text-ink-muted block">Flete y Tránsito</span>
                  <span className="font-extrabold text-amber-700 tabular-nums">
                    +{formatNIO(selectedOrder.totalImportExpensesNio || 0)}
                  </span>
                  <span className="text-[10px] text-ink-muted block">
                    Tasa: C$ {selectedOrder.exchangeRate || dataStore.getExchangeRate()}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-moss/25">
                  <span className="text-[10px] uppercase font-bold text-moss-800 block">Costo Total Landed</span>
                  <span className="font-extrabold text-moss-800 text-sm tabular-nums">
                    {formatNIO(selectedOrder.totalCostNio + (selectedOrder.totalImportExpensesNio || 0))}
                  </span>
                </div>
              </div>
            </div>

            {/* PASO 2: CONTEO E INSPECCIÓN FÍSICA POR SKU */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-ink">
                    Paso 2: Inspección Física y Costo Prorrateado por SKU
                  </h4>
                  <p className="text-xs text-ink-muted">
                    Verifica el costo landed unitario ya prorrateado y confirma cuántas unidades llegaron en esta entrega.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={clearAllPending}
                    className="text-xs font-semibold text-ink-muted hover:text-ink hover:underline"
                  >
                    Poner en 0
                  </button>
                  <button
                    type="button"
                    onClick={fillAllPending}
                    className="text-xs font-bold text-moss hover:underline"
                  >
                    Llegó todo lo pendiente
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {selectedOrder.items.map((it) => {
                  const pending = pendingQty(it);
                  const current = receptionMap[it.id] || { qty: 0, decision: 'recibir' as LineDecision };
                  const closed = pending === 0;
                  const skuInfo = skuMap.get(it.skuId) || (it.skuCode ? skuMap.get(it.skuCode) : undefined);
                  const displayDesc = skuInfo?.skuDescription || it.skuDescription || it.productName;

                  return (
                    <div
                      key={it.id}
                      className={`p-3.5 rounded-xl border flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                        closed ? 'bg-surface/50 border-moss/10 opacity-70' : 'bg-surface border-moss/15'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <SkuMiniThumb url={skuInfo?.mainImageUrl || it.mainImageUrl} alt={it.skuCode || it.skuId} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono font-extrabold text-moss-800 bg-moss/10 px-2 py-0.5 rounded-md">
                              {it.skuCode || it.skuId}
                            </span>
                            {(it.modality || selectedOrder.modality) === 'especial' ? (
                              <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
                                📦 Bajo Pedido / Apartar{it.orderRef ? `: ${it.orderRef}` : ''}
                              </span>
                            ) : (it.modality || selectedOrder.modality) === 'regalia' ? (
                              <span className="text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
                                🎁 Regalía
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
                                🏪 Vitrina / Stock Libre
                              </span>
                            )}
                            <h4 className="text-xs font-bold text-ink truncate">{displayDesc}</h4>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted mt-1.5">
                            <span>
                              Pedido: <strong className="text-ink tabular-nums">{it.quantityOrdered}</strong>
                            </span>
                            <span>
                              Recibido: <strong className="text-ink tabular-nums">{it.quantityReceived || 0}</strong>
                            </span>
                            <span>
                              Pendiente: <strong className="text-ink tabular-nums">{pending}</strong>
                            </span>
                            <span className="text-ink-muted">|</span>
                            <span>
                              Base: <strong className="text-ink tabular-nums">{formatNIO(it.unitCostNio)}</strong>
                            </span>
                            <span>
                              +Flete/u:{' '}
                              <strong className="text-amber-700 tabular-nums">
                                +{formatNIO(it.proratedExpenseNio || 0)}
                              </strong>
                            </span>
                            <span className="bg-moss/10 text-moss-800 px-1.5 py-0.5 rounded font-bold">
                              Costo Landed/u: <strong className="tabular-nums">{formatNIO(it.totalLandedCostNio)}</strong>
                            </span>
                            <span>
                              P. Sugerido: <strong className="text-ink tabular-nums">{formatNIO(it.suggestedSalePriceNio)}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {closed ? (
                        <StatusBadge status={it.receptionStatus} />
                      ) : (
                        <div className="flex flex-wrap items-end gap-2.5 shrink-0">
                          {selectedOrder.prorationMethod === 'peso' && (
                            <div>
                              <label className="text-[10px] font-bold text-ink-muted block mb-0.5">
                                Peso/u (Lb)
                              </label>
                              <input
                                type="number"
                                step="0.05"
                                min="0.01"
                                value={itemWeights[it.id] ?? it.weightLbs ?? 0.5}
                                onChange={(e) => handleWeightChange(it.id, parseFloat(e.target.value) || 0.1)}
                                className="w-16 bg-white border border-moss/20 rounded-lg px-2 py-1.5 text-xs text-center text-ink font-semibold tabular-nums"
                              />
                            </div>
                          )}

                          <div>
                            <label htmlFor={`rec-qty-${it.id}`} className="text-[10px] font-bold text-ink-muted block mb-0.5">
                              Llegó ahora
                            </label>
                            <input
                              id={`rec-qty-${it.id}`}
                              type="number"
                              min="0"
                              max={pending}
                              value={current.qty}
                              onChange={(e) => {
                                const v = Math.max(0, Math.min(pending, parseInt(e.target.value, 10) || 0));
                                setReceptionMap({ ...receptionMap, [it.id]: { ...current, qty: v } });
                              }}
                              className="w-20 bg-white border border-moss/20 rounded-lg px-2 py-1.5 text-sm text-center text-ink font-bold tabular-nums"
                            />
                          </div>

                          <div>
                            <label htmlFor={`rec-dec-${it.id}`} className="text-[10px] font-bold text-ink-muted block mb-0.5">
                              Lo que falta
                            </label>
                            <select
                              id={`rec-dec-${it.id}`}
                              value={current.decision}
                              onChange={(e) =>
                                setReceptionMap({
                                  ...receptionMap,
                                  [it.id]: { ...current, decision: e.target.value as LineDecision },
                                })
                              }
                              className="bg-white border border-moss/20 rounded-lg px-2 py-1.5 text-xs text-ink"
                            >
                              <option value="recibir">Puede llegar después</option>
                              <option value="no_vino">No vino (cerrar faltante)</option>
                              <option value="devuelto">Devuelto / dañado (cerrar)</option>
                              <option value="cancelado">Cancelado (cerrar)</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-moss/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-ink-muted">
                Las prendas recibidas entrarán al Kardex al <strong>Costo Landed Unitario</strong> prorrateado.
              </span>
              <div className="flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-surface"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmReception}
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-moss hover:bg-moss-700 disabled:opacity-50 text-white shadow-md shadow-moss/20"
                >
                  {saving ? 'Registrando…' : 'Confirmar entrada a bodega'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Detalle de Recepción Realizada (Bajo Demanda) */}
      <Modal
        isOpen={!!detailOrder}
        onClose={() => setDetailOrder(null)}
        title={`Detalle de Recepción: ${detailOrder?.orderNumber || ''}`}
        subtitle="Resumen de mercadería ingresada, costos prorrateados y registros de entrada en Kardex."
        maxWidth="3xl"
      >
        {detailOrder && (
          <div className="space-y-5">
            {/* Cabecera informativa */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface p-3.5 rounded-2xl border border-moss/15 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-ink-muted block">Proveedor</span>
                <span className="font-bold text-ink">{detailOrder.supplierName}</span>
                {detailOrder.trackingNumber && (
                  <span className="block text-[10px] font-mono text-ink-muted mt-0.5">
                    Trk: {detailOrder.trackingNumber}
                  </span>
                )}
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-ink-muted block">Fechas</span>
                <span className="font-bold text-ink block">
                  Recibido: {detailOrder.dateReceivedNicaragua || detailOrder.updatedAt?.split('T')[0] || 'N/A'}
                </span>
                <span className="text-[10px] text-ink-muted">Compra: {detailOrder.datePurchased}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-ink-muted block">Prorrateo y Tasa</span>
                <span className="font-bold text-ink block">
                  {detailOrder.prorationMethod === 'peso' ? 'Por Peso (Lb)' : 'Por Valor ($)'}
                </span>
                <span className="text-[10px] text-ink-muted">
                  Tasa: C$ {detailOrder.exchangeRate || dataStore.getExchangeRate()}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-ink-muted block">Estado Recepción</span>
                <div className="mt-1">
                  <StatusBadge status={detailOrder.status} />
                </div>
              </div>
            </div>

            {/* Resumen financiero */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white border border-moss/15">
                <span className="text-[10px] uppercase font-bold text-ink-muted block">Costo Base Orden</span>
                <span className="text-sm font-extrabold text-ink tabular-nums">
                  {formatNIO(detailOrder.totalCostNio)}
                </span>
                <span className="block text-[10px] text-ink-muted">{formatUSD(detailOrder.totalCostUsd)}</span>
              </div>
              <div className="p-3 rounded-xl bg-white border border-moss/15">
                <span className="text-[10px] uppercase font-bold text-ink-muted block">
                  Flete y Tránsito ({detailOrder.expenses.length} reg.)
                </span>
                <span className="text-sm font-extrabold text-amber-700 tabular-nums">
                  +{formatNIO(detailOrder.totalImportExpensesNio || 0)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-moss/10 border border-moss/25">
                <span className="text-[10px] uppercase font-bold text-moss-900 block">Costo Total Landed</span>
                <span className="text-sm font-extrabold text-moss-900 tabular-nums">
                  {formatNIO((detailOrder.totalCostNio || 0) + (detailOrder.totalImportExpensesNio || 0))}
                </span>
              </div>
            </div>

            {/* Desglose de gastos de flete/tránsito si existen */}
            {detailOrder.expenses.length > 0 && (
              <div className="space-y-1.5">
                <h5 className="text-xs font-extrabold uppercase tracking-wider text-ink">
                  Gastos de Flete y Tránsito Prorrateados
                </h5>
                <div className="divide-y divide-moss/10 bg-surface rounded-xl border border-moss/15 overflow-hidden text-xs">
                  {detailOrder.expenses.map((exp) => (
                    <div key={exp.id} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <span className="font-semibold text-ink">{exp.concept}</span>
                        {exp.notes && <span className="text-[10px] text-ink-muted ml-2">({exp.notes})</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-ink-muted font-mono">{formatUSD(exp.amountUsd)}</span>
                        <span className="font-bold text-amber-800 tabular-nums">{formatNIO(exp.amountNio)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SKUs recibidos en la orden */}
            <div className="space-y-2">
              <h5 className="text-xs font-extrabold uppercase tracking-wider text-ink">
                Detalle de SKUs y Costo Landed Recibido ({detailOrder.items.length})
              </h5>
              <div className="border border-moss/15 rounded-xl overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-soft text-ink-muted border-b border-moss/10 font-bold sticky top-0">
                      <tr>
                        <th className="p-2.5">SKU</th>
                        <th className="p-2.5 text-center">Pedido</th>
                        <th className="p-2.5 text-center">Recibido</th>
                        <th className="p-2.5 text-right">Costo Base</th>
                        <th className="p-2.5 text-right">+Flete/u</th>
                        <th className="p-2.5 text-right">Landed/u</th>
                        <th className="p-2.5 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-moss/10 text-ink bg-white">
                      {detailOrder.items.map((it) => {
                        const skuInfo = skuMap.get(it.skuId) || (it.skuCode ? skuMap.get(it.skuCode) : undefined);
                        const displayDesc = skuInfo?.skuDescription || it.skuDescription || it.productName;
                        return (
                          <tr key={it.id} className="hover:bg-surface/60">
                            <td className="p-2.5">
                              <div className="flex items-center gap-2.5">
                                <SkuMiniThumb
                                  url={skuInfo?.mainImageUrl || it.mainImageUrl}
                                  alt={it.skuCode || it.skuId}
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono text-[11px] font-extrabold text-moss bg-moss/10 px-1.5 py-0.5 rounded">
                                      {it.skuCode || it.skuId}
                                    </span>
                                    {(it.modality || detailOrder.modality) === 'especial' ? (
                                      <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
                                        📦 Bajo Pedido{it.orderRef ? `: ${it.orderRef}` : ''}
                                      </span>
                                    ) : (it.modality || detailOrder.modality) === 'regalia' ? (
                                      <span className="text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
                                        🎁 Regalía
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
                                        🏪 Vitrina / Stock Libre
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs font-semibold text-ink truncate max-w-[200px]" title={displayDesc}>
                                    {displayDesc}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="p-2.5 text-center font-mono">{it.quantityOrdered}</td>
                            <td className="p-2.5 text-center font-mono font-bold text-moss">
                              {it.quantityReceived || 0}
                            </td>
                            <td className="p-2.5 text-right tabular-nums">{formatNIO(it.unitCostNio)}</td>
                            <td className="p-2.5 text-right text-amber-700 font-medium tabular-nums">
                              +{formatNIO(it.proratedExpenseNio || 0)}
                            </td>
                            <td className="p-2.5 text-right font-extrabold text-ink tabular-nums">
                              {formatNIO(it.totalLandedCostNio)}
                            </td>
                            <td className="p-2.5 text-center">
                              <StatusBadge status={it.receptionStatus} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Movimientos de entrada en Kardex cargados bajo demanda */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-extrabold uppercase tracking-wider text-ink">
                  Bitácora de Entradas en Kardex ({detailMovements.length})
                </h5>
                {loadingDetailMovements && (
                  <span className="text-[11px] text-ink-muted animate-pulse">Consultando movimientos...</span>
                )}
              </div>
              {!loadingDetailMovements && detailMovements.length === 0 ? (
                <p className="text-xs text-ink-muted bg-surface p-3 rounded-xl border border-moss/10">
                  No se encontraron registros adicionales de bitácora para esta recepción.
                </p>
              ) : (
                <div className="max-h-44 overflow-y-auto divide-y divide-moss/10 bg-surface rounded-xl border border-moss/15 text-xs">
                  {detailMovements.map((m) => (
                    <div key={m.id} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <span className="font-mono font-bold text-moss">{m.skuCode || m.skuId}</span>
                        <span className="text-ink-muted ml-2">
                          {new Date(m.createdAt).toLocaleString('es-NI')}
                        </span>
                        {m.notes && <p className="text-[11px] text-ink-muted">{m.notes}</p>}
                      </div>
                      <div className="text-right font-mono">
                        <span className="font-bold text-emerald-800">+{m.quantity} unids.</span>
                        <span className="block text-[10px] text-ink-muted">
                          Stock: {m.previousStock} → {m.newStock}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-moss/10 flex justify-end gap-2">
              {detailOrder.status === 'recibido_parcial' && (
                <button
                  type="button"
                  onClick={() => {
                    const ord = detailOrder;
                    setDetailOrder(null);
                    handleOpenInspection(ord);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-moss hover:bg-moss-700 text-white"
                >
                  Recibir Unidades Faltantes
                </button>
              )}
              <button
                type="button"
                onClick={() => setDetailOrder(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-surface hover:bg-moss/10 text-ink"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

