'use client';

import React, { useState, useEffect } from 'react';
import {
  PackageSearch,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  XCircle,
  Truck,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { StatusBadge } from '@/presentation/components/ui/StatusBadge';
import { Modal } from '@/presentation/components/ui/Modal';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { formatNIO, formatUSD } from '@/domain/shared/utils/currencyFormatter';
import { PurchaseOrder, ReceptionItemStatus } from '@/domain/procurement/types';

export function RecepcionesView() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [receptionMap, setReceptionMap] = useState<Record<string, { qty: number; status: ReceptionItemStatus }>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);

  const refreshData = () => {
    setOrders(dataStore.getPurchaseOrders());
  };

  useEffect(() => {
    refreshData();
    const unsub = dataStore.subscribe(refreshData);
    return unsub;
  }, []);

  const handleOpenInspection = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    const initialMap: Record<string, { qty: number; status: ReceptionItemStatus }> = {};
    order.items.forEach((it) => {
      initialMap[it.skuId] = {
        qty: it.quantityReceived > 0 ? it.quantityReceived : it.quantityOrdered,
        status: it.receptionStatus === 'pendiente' ? 'recibido' : it.receptionStatus,
      };
    });
    setReceptionMap(initialMap);
    setIsModalOpen(true);
  };

  const handleConfirmReception = () => {
    if (!selectedOrder) return;
    const receivedPayload = Object.entries(receptionMap).map(([skuId, val]) => ({
      skuId,
      quantityReceived: val.status === 'recibido' ? val.qty : 0,
      status: val.status,
    }));

    dataStore.receivePurchaseOrder(selectedOrder.id, receivedPayload);
    setIsModalOpen(false);
  };

  const pendingReceptionOrders = orders.filter((o) => o.status !== 'recibido_completo' && o.status !== 'cancelado');

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
          <PackageSearch className="w-5 h-5 text-moss" />
          Módulo de Recepción, Inspección Física & Aduana
        </h1>
        <p className="text-xs text-ink-muted">
          Recepción de lotes llegados a Nicaragua, marcado de faltantes (no vino), devoluciones y entrada automática a inventario.
        </p>
      </div>

      {/* Orders ready for reception */}
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
                    <span className="text-ink-muted">Total Piezas:</span>
                    <span className="font-bold text-moss">
                      {order.items.reduce((acc, i) => acc + i.quantityOrdered, 0)} unidades
                    </span>
                  </div>
                  <div className="flex justify-between">
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
                <span>Inspeccionar & Recibir en Bodega</span>
                <ArrowRight className="w-4 h-4 text-mustard" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Modal de Inspección */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Inspección Física del Lote: ${selectedOrder?.orderNumber}`}
        subtitle="Verifica cada prenda. Marca si vino completa, si faltó algún ítem o si llegó dañado para devolución."
        maxWidth="3xl"
      >
        {selectedOrder && (
          <div className="space-y-5">
            <div className="space-y-3">
              {selectedOrder.items.map((it) => {
                const current = receptionMap[it.skuId] || { qty: it.quantityOrdered, status: 'recibido' };

                return (
                  <div
                    key={it.id}
                    className="bg-surface p-4 rounded-xl border border-moss/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-ink">{it.productName}</h4>
                      <p className="text-[11px] font-mono text-ink-muted mt-0.5">{it.skuCode}</p>
                      <div className="flex items-center gap-3 text-[11px] text-ink-muted mt-1">
                        <span>Pedido: <strong className="text-ink">{it.quantityOrdered} unids.</strong></span>
                        <span>Costo Landed: <strong className="text-moss-800">{formatNIO(it.totalLandedCostNio)}</strong></span>
                        <span>Precio Sugerido: <strong className="text-emerald-700">{formatNIO(it.suggestedSalePriceNio)}</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-ink-muted block mb-0.5">Cant. Recibida</label>
                        <input
                          type="number"
                          min="0"
                          max={it.quantityOrdered}
                          value={current.qty}
                          onChange={(e) => {
                            setReceptionMap({
                              ...receptionMap,
                              [it.skuId]: { ...current, qty: parseInt(e.target.value) || 0 },
                            });
                          }}
                          className="w-16 bg-white border border-moss/20 rounded-lg px-2 py-1 text-xs text-center text-ink font-bold"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-ink-muted block mb-0.5">Condición / Estado</label>
                        <select
                          value={current.status}
                          onChange={(e) => {
                            setReceptionMap({
                              ...receptionMap,
                              [it.skuId]: { ...current, status: e.target.value as ReceptionItemStatus },
                            });
                          }}
                          className="bg-white border border-moss/20 rounded-lg px-2 py-1 text-xs text-ink"
                        >
                          <option value="recibido">Recibido OK</option>
                          <option value="no_vino">No Vino (Faltante Shein)</option>
                          <option value="devuelto">Devuelto / Dañado</option>
                          <option value="cancelado">Cancelado</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-moss/10 flex items-center justify-between">
              <span className="text-xs text-ink-muted">
                Al confirmar, los ítems marcados como &apos;Recibido OK&apos; ingresarán automáticamente al Kardex de Inventario.
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-surface"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmReception}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-moss hover:bg-moss-700 text-white shadow-md shadow-moss/20"
                >
                  Confirmar Entrada a Bodega
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
