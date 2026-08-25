'use client';

import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Plus,
  Truck,
  DollarSign,
  Calculator,
  Search,
  Filter,
  Trash2,
  ReceiptText,
  BadgeDollarSign,
} from 'lucide-react';
import { StatusBadge } from '@/presentation/components/ui/StatusBadge';
import { Modal } from '@/presentation/components/ui/Modal';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { formatNIO, formatUSD } from '@/domain/shared/utils/currencyFormatter';
import { PurchaseOrder, PurchaseModality, PurchaseStatus, PurchaseItem, ImportExpense } from '@/domain/procurement/types';
import { ProductSku } from '@/domain/catalog/types';
import { prorateExpenses, calculateSuggestedPrice } from '@/domain/procurement/services/prorationService';

export function ComprasView() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [skus, setSkus] = useState<ProductSku[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalityFilter, setModalityFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(36.80);

  // Modal Agregar Gasto a Orden Existente
  const [selectedOrderForExpense, setSelectedOrderForExpense] = useState<PurchaseOrder | null>(null);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseConcept, setExpenseConcept] = useState('Flete Aéreo MGA');
  const [expenseAmountUsd, setExpenseAmountUsd] = useState<number>(0);
  const [expenseAmountNio, setExpenseAmountNio] = useState<number>(0);
  const [expenseCurrency, setExpenseCurrency] = useState<'USD' | 'NIO'>('USD');
  const [expenseNotes, setExpenseNotes] = useState('');

  // Form State para Crear Orden
  const [orderNumber, setOrderNumber] = useState('');
  const [supplierName, setSupplierName] = useState('Shein USA');
  const [supplierOrderId, setSupplierOrderId] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [modality, setModality] = useState<PurchaseModality>('simple');
  const [status, setStatus] = useState<PurchaseStatus>('comprado');
  const [selectedItems, setSelectedItems] = useState<{ skuId: string; quantity: number; costUsd: number }[]>([]);
  const [expenses, setExpenses] = useState<{ concept: string; amountUsd: number }[]>([
    { concept: 'Flete Aéreo Casillero Miami', amountUsd: 15.00 }
  ]);
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

  const handleOpenCreateModal = () => {
    const nextNum = `LOT-PO-${Date.now().toString().slice(-4)}`;
    setOrderNumber(nextNum);
    setSelectedItems(skus.length > 0 ? [{ skuId: skus[0].id, quantity: 5, costUsd: skus[0].costPriceUsd || 5.00 }] : []);
    setIsModalOpen(true);
  };

  const handleOpenExpenseModal = (order: PurchaseOrder) => {
    setSelectedOrderForExpense(order);
    setExpenseConcept('Flete / Retiro en Nicaragua');
    setExpenseAmountUsd(10.00);
    setExpenseAmountNio(10.00 * exchangeRate);
    setExpenseCurrency('USD');
    setExpenseNotes('');
    setIsExpenseModalOpen(true);
  };

  const handleAddItemRow = () => {
    if (skus.length > 0) {
      setSelectedItems([...selectedItems, { skuId: skus[0].id, quantity: 1, costUsd: skus[0].costPriceUsd || 5.00 }]);
    }
  };

  const handleAddExpenseRow = () => {
    setExpenses([...expenses, { concept: 'Gasto de Aduana / Entrega', amountUsd: 5.00 }]);
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber || selectedItems.length === 0) return;

    const purchaseItems: PurchaseItem[] = selectedItems.map((it) => {
      const sku = skus.find((s) => s.id === it.skuId);
      const unitCostNio = it.costUsd * exchangeRate;
      return {
        id: `pi-${Date.now()}-${Math.random().toString().slice(2, 6)}`,
        purchaseOrderId: '',
        skuId: it.skuId,
        skuCode: sku?.skuCode || 'SKU-TEMP',
        productName: sku?.skuDescription || 'Producto',
        quantityOrdered: Number(it.quantity),
        quantityReceived: 0,
        unitCostUsd: Number(it.costUsd),
        unitCostNio: Number(unitCostNio.toFixed(2)),
        proratedExpenseNio: 0,
        totalLandedCostNio: Number(unitCostNio.toFixed(2)),
        suggestedSalePriceNio: calculateSuggestedPrice(unitCostNio, modality),
        receptionStatus: 'pendiente',
      };
    });

    const importExpenses: ImportExpense[] = expenses.map((exp) => ({
      id: `exp-${Date.now()}-${Math.random().toString().slice(2, 6)}`,
      concept: exp.concept,
      amountUsd: Number(exp.amountUsd),
      amountNio: Number((exp.amountUsd * exchangeRate).toFixed(2)),
    }));

    const proratedItems = prorateExpenses(purchaseItems, importExpenses, modality);
    const totalCostUsd = selectedItems.reduce((acc, it) => acc + it.costUsd * it.quantity, 0);
    const totalCostNio = totalCostUsd * exchangeRate;
    const totalExpensesNio = importExpenses.reduce((acc, exp) => acc + exp.amountNio, 0);

    dataStore.addPurchaseOrder({
      orderNumber,
      supplierName,
      supplierOrderId,
      trackingNumber,
      modality,
      status,
      datePurchased: new Date().toISOString().split('T')[0],
      totalCostUsd: Number(totalCostUsd.toFixed(2)),
      totalCostNio: Number(totalCostNio.toFixed(2)),
      totalImportExpensesNio: Number(totalExpensesNio.toFixed(2)),
      items: proratedItems,
      expenses: importExpenses,
      notes,
    });

    setIsModalOpen(false);
  };

  const handleSaveAdditionalExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForExpense || !expenseConcept) return;

    let finalAmountUsd = expenseAmountUsd;
    let finalAmountNio = expenseAmountNio;

    if (expenseCurrency === 'USD') {
      finalAmountNio = Number((expenseAmountUsd * exchangeRate).toFixed(2));
    } else {
      finalAmountUsd = Number((expenseAmountNio / exchangeRate).toFixed(2));
    }

    dataStore.addExpenseToOrder(selectedOrderForExpense.id, {
      concept: expenseConcept,
      amountUsd: finalAmountUsd,
      amountNio: finalAmountNio,
      notes: expenseNotes,
    });

    setIsExpenseModalOpen(false);
  };

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.trackingNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.supplierName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesModality = modalityFilter === 'all' || o.modality === modalityFilter;
    return matchesSearch && matchesModality;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-moss" />
            Compras e Importaciones (Shein / Amazon)
          </h1>
          <p className="text-xs text-ink-muted">
            Control de lotes, tracking de casilleros, registro de fletes (incluso al retirar en Nicaragua) y prorrateo automático.
          </p>
        </div>

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
                    </div>
                    <div className="flex items-center gap-4 text-xs text-ink-muted mt-1 flex-wrap font-medium">
                      <span>Tracking: <strong className="font-mono text-ink">{order.trackingNumber || 'Sin Asignar'}</strong></span>
                      {order.supplierOrderId && <span>ID Pedido: <strong className="font-mono text-ink">{order.supplierOrderId}</strong></span>}
                      <span>Fecha Compra: {order.datePurchased}</span>
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
                      <th className="pb-2 font-bold">SKU / Producto</th>
                      <th className="pb-2 font-bold text-center">Cant. Pedida</th>
                      <th className="pb-2 font-bold text-right">Costo Base Unit.</th>
                      <th className="pb-2 font-bold text-right">Flete Prorrateado</th>
                      <th className="pb-2 font-bold text-right text-moss-800">Costo Final Aterrizado</th>
                      <th className="pb-2 font-bold text-right text-emerald-800">Precio Venta Sugerido</th>
                      <th className="pb-2 font-bold text-center">Estado Item</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-moss/10">
                    {order.items.map((it) => (
                      <tr key={it.id} className="text-ink">
                        <td className="py-2.5">
                          <p className="font-bold text-ink">{it.productName}</p>
                          <span className="font-mono text-[10px] text-ink-muted">{it.skuCode}</span>
                        </td>
                        <td className="py-2.5 text-center font-bold">{it.quantityOrdered} unids.</td>
                        <td className="py-2.5 text-right">{formatUSD(it.unitCostUsd)} ({formatNIO(it.unitCostNio)})</td>
                        <td className="py-2.5 text-right text-amber-800 font-medium">+{formatNIO(it.proratedExpenseNio)}</td>
                        <td className="py-2.5 text-right font-bold text-moss-800">{formatNIO(it.totalLandedCostNio)}</td>
                        <td className="py-2.5 text-right font-bold text-emerald-700">{formatNIO(it.suggestedSalePriceNio)}</td>
                        <td className="py-2.5 text-center"><StatusBadge status={it.receptionStatus} /></td>
                      </tr>
                    ))}
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

      {/* Modal Crear Orden Completa */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Registrar Nuevo Lote de Compra (Shein / Amazon / Proveedor)"
        subtitle="Ingresa los productos. Podrás agregar o ajustar los gastos de flete en cualquier momento posterior."
        maxWidth="3xl"
      >
        <form onSubmit={handleCreateOrder} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1">Código de Lote *</label>
              <input
                type="text"
                required
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
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
                <option value="especial">Bajo Pedido Cliente (Margen 25%)</option>
                <option value="regalia">Regalía / Promoción</option>
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
              <span className="text-xs font-bold text-ink">Productos del Pedido</span>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="text-xs text-moss hover:text-moss-800 font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar Ítem
              </button>
            </div>

            <div className="space-y-2">
              {selectedItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-surface p-2 rounded-xl border border-moss/15">
                  <select
                    value={item.skuId}
                    onChange={(e) => {
                      const updated = [...selectedItems];
                      updated[idx].skuId = e.target.value;
                      const s = skus.find((sku) => sku.id === e.target.value);
                      if (s) updated[idx].costUsd = s.costPriceUsd || 5.0;
                      setSelectedItems(updated);
                    }}
                    className="flex-1 bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink"
                  >
                    {skus.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.skuDescription} ({s.skuCode})
                      </option>
                    ))}
                  </select>
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
                    className="w-20 bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink text-center"
                  />
                  <div className="flex items-center gap-1 text-xs text-ink">
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
                      className="w-24 bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink text-right font-semibold"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedItems(selectedItems.filter((_, i) => i !== idx))}
                    className="p-1 text-ink-muted hover:text-rose-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Expenses */}
          <div className="pt-2 border-t border-moss/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-ink">Gastos Iniciales de Flete (Opcional, puedes agregar más luego)</span>
              <button
                type="button"
                onClick={handleAddExpenseRow}
                className="text-xs text-moss hover:text-moss-800 font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar Gasto
              </button>
            </div>

            <div className="space-y-2">
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

          <div className="pt-4 border-t border-moss/10 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-moss hover:bg-moss-700 text-white shadow-md shadow-moss/20"
            >
              Guardar y Calcular Prorrateo
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
