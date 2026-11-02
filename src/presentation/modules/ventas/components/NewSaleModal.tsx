'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, UserPlus, User, UserCheck, ShoppingBag, CreditCard, Truck, Receipt } from 'lucide-react';
import { Modal } from '@/presentation/components/ui/Modal';
import { Customer, SaleType, PaymentTerm, PaymentMethod, DeliveryStatus, SalesInvoice } from '@/domain/sales/types';
import { StockLevel } from '@/domain/inventory/types';
import { calculateInvoiceTotals } from '@/domain/sales/services/invoicingService';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { dataStore, WALK_IN_CUSTOMER_ID } from '@/infrastructure/repositories/dataStore';
import { SkuSearchSelect } from './SkuSearchSelect';

interface NewSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  stockList: StockLevel[];
  /** Devuelve false si la venta no se pudo registrar (el modal permanece abierto) */
  onSubmit: (invoiceData: Omit<SalesInvoice, 'id' | 'amountPaidNio' | 'balanceDueNio'>) => Promise<boolean> | boolean | void;
}

interface FormItem {
  skuId: string;
  quantity: number;
  unitPriceSinIva: number;
  regularPriceSinIva: number;
  discountNio: number;
  itemType?: SaleType; // 'normal' | 'pedido'
}

type CustomerMode = 'invitado' | 'existente' | 'nuevo';

export function NewSaleModal({
  isOpen,
  onClose,
  customers,
  stockList,
  onSubmit,
}: NewSaleModalProps) {
  const registeredCustomers = useMemo(
    () => customers.filter((c) => c.id !== WALK_IN_CUSTOMER_ID),
    [customers]
  );
  const [customerMode, setCustomerMode] = useState<CustomerMode>('invitado');
  const [customerId, setCustomerId] = useState('');
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustCity, setNewCustCity] = useState('Managua');
  const [newCustIdNumber, setNewCustIdNumber] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');

  const [saleType, setSaleType] = useState<SaleType>('normal');
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>('contado');
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>('entregado');
  const [trackingRef, setTrackingRef] = useState('');
  const [invoiceItems, setInvoiceItems] = useState<FormItem[]>([]);
  const [initialPaymentAmount, setInitialPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo_cordobas');
  const [notes, setNotes] = useState('');
  const [stockErrors, setStockErrors] = useState<string[]>([]);
  const [cashReceived, setCashReceived] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const exchangeRate = dataStore.getExchangeRate();

  // Tasa de IVA según el régimen fiscal configurado (0 en cuota fija: el precio del SKU es el precio final)
  const ivaRate = useMemo(() => dataStore.getIvaRate(), [isOpen]);
  const hasIva = ivaRate > 0;

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      const hasCustomers = registeredCustomers.length > 0;
      setCustomerMode('invitado');
      setCustomerId(hasCustomers ? registeredCustomers[0].id : '');
      setNewCustName('');
      setNewCustPhone('');
      setNewCustCity('Managua');
      setNewCustIdNumber('');
      setNewCustAddress('');

      setSaleType('normal');
      setPaymentTerm('contado');
      setDeliveryStatus('entregado');
      setTrackingRef('');
      setNotes('');

      setInvoiceItems([]);
      setInitialPaymentAmount(0);
      setStockErrors([]);
      setCashReceived(0);
      setSaving(false);
    }
  }, [isOpen, registeredCustomers, stockList]);

  // Si se elige Cliente Invitado, forzar Contado
  useEffect(() => {
    if (customerMode === 'invitado' && paymentTerm === 'credito') {
      setPaymentTerm('contado');
    }
  }, [customerMode, paymentTerm]);

  // Lista unificada completa de todos los SKUs del catálogo
  // asegurando que cualquier SKU (incluso sin recepcionar o con stock 0) pueda ser seleccionado
  const availableSkusList: StockLevel[] = useMemo(() => {
    const products = dataStore.getProducts();
    const stockMap = new Map(stockList.map((s) => [s.skuId, s]));

    // Comenzar con los que ya están en stockList
    const combined: StockLevel[] = [...stockList];

    // Agregar cualquier SKU registrado en productos que no esté en stockList
    products.forEach((p) => {
      (p.skus || []).forEach((sku) => {
        if (!stockMap.has(sku.id)) {
          combined.push({
            skuId: sku.id,
            skuCode: sku.skuCode,
            productName: p.name,
            skuDescription: sku.skuDescription || sku.skuCode,
            size: sku.size,
            colorName: sku.colorName,
            colorHex: sku.colorHex,
            mainImageUrl: sku.mainImageUrl,
            costPriceNio: sku.costPriceNio,
            salePriceNio: sku.salePriceNio,
            quantityAvailable: 0,
            quantityReserved: 0,
          });
        }
      });
    });

    return combined;
  }, [stockList]);



  // Live calculation of totals
  const currentTotals = calculateInvoiceTotals(
    invoiceItems.map((it) => {
      const lineSinIva = it.unitPriceSinIva * it.quantity - (it.discountNio || 0);
      const ivaAmount = lineSinIva * ivaRate;
      return {
        skuId: it.skuId,
        quantity: it.quantity,
        unitPriceSinIvaNio: it.unitPriceSinIva,
        regularPriceSinIvaNio: it.regularPriceSinIva,
        unitPriceNio: it.unitPriceSinIva,
        unitCostNio: 0,
        ivaAmountNio: ivaAmount,
        discountNio: it.discountNio || 0,
        lineTotalSinIvaNio: lineSinIva,
        lineTotalConIvaNio: lineSinIva + ivaAmount,
        lineTotalNio: lineSinIva + ivaAmount,
      };
    }) as any,
    0,
    ivaRate
  );

  const handleAddItemRow = () => {
    if (availableSkusList.length > 0) {
      const defaultItem = availableSkusList[0];
      const baseSinIva = Number((defaultItem.salePriceNio / (1 + ivaRate)).toFixed(2));
      setInvoiceItems([
        ...invoiceItems,
        {
          skuId: defaultItem.skuId,
          quantity: 1,
          unitPriceSinIva: baseSinIva,
          regularPriceSinIva: baseSinIva,
          discountNio: 0,
          itemType: saleType,
        },
      ]);
    }
  };

  const handleRemoveItemRow = (idx: number) => {
    if (invoiceItems.length <= 1) return;
    setInvoiceItems(invoiceItems.filter((_, i) => i !== idx));
  };

  const handleUpdateItemRow = (idx: number, field: keyof FormItem, value: any) => {
    const updated = [...invoiceItems];
    updated[idx] = { ...updated[idx], [field]: value };

    // If SKU changed, update unit price
    if (field === 'skuId') {
      const selectedItem = availableSkusList.find((s) => s.skuId === value);
      if (selectedItem) {
        const baseSinIva = Number((selectedItem.salePriceNio / (1 + ivaRate)).toFixed(2));
        updated[idx].unitPriceSinIva = baseSinIva;
        updated[idx].regularPriceSinIva = baseSinIva;
      }
    }

    setInvoiceItems(updated);
  };


  // De contado se cobra el total completo; a crédito, el abono inicial indicado
  const paymentNow = paymentTerm === 'contado'
    ? currentTotals.totalConIvaNio
    : Math.min(initialPaymentAmount, currentTotals.totalConIvaNio);
  const isCash = paymentMethod === 'efectivo_cordobas' || paymentMethod === 'efectivo_dolares';
  const cashReceivedNio = paymentMethod === 'efectivo_dolares' ? cashReceived * exchangeRate : cashReceived;
  const changeDue = isCash && cashReceived > 0 ? cashReceivedNio - paymentNow : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invoiceItems.length === 0) return;

    // Venta inmediata: no se puede vender más de lo disponible para líneas de entrega inmediata.
    // Para líneas configuradas como "Bajo Pedido", se permite vender sin existencia física inmediata.
    const hasPreorderItems = invoiceItems.some((it) => (it.itemType || saleType) === 'pedido');
    if (saleType === 'normal') {
      const requested: Record<string, number> = {};
      invoiceItems
        .filter((it) => (it.itemType || saleType) !== 'pedido')
        .forEach((it) => {
          requested[it.skuId] = (requested[it.skuId] || 0) + it.quantity;
        });
      const errors = Object.entries(requested)
        .map(([skuId, qty]) => {
          const available = dataStore.getAvailableToSell(skuId);
          if (qty <= available) return null;
          const info = availableSkusList.find((s) => s.skuId === skuId);
          return `${info?.skuCode || 'SKU'} ${info?.productName ? `(${info.productName})` : ''}: pedido ${qty}, disponible ${available}`;
        })
        .filter((x): x is string => Boolean(x));
      if (errors.length > 0) {
        setStockErrors(errors);
        return;
      }
    }
    setStockErrors([]);

    let targetCust: Customer | undefined;
    let targetCustId = customerId;

    if (customerMode === 'invitado') {
      if (paymentTerm === 'credito') {
        alert('Las ventas a crédito requieren seleccionar o registrar un cliente con nombre y teléfono.');
        return;
      }
      targetCust = dataStore.getWalkInCustomer();
      targetCustId = WALK_IN_CUSTOMER_ID;
    } else if (customerMode === 'nuevo' || registeredCustomers.length === 0 || !customerId) {
      if (!newCustName.trim() || !newCustPhone.trim()) {
        alert('Por favor ingrese el nombre y teléfono del cliente.');
        return;
      }
      const createdCustomer = dataStore.addCustomer({
        fullName: newCustName.trim(),
        phoneWhatsapp: newCustPhone.trim(),
        city: newCustCity.trim() || 'Managua',
        identificationNumber: newCustIdNumber.trim() || undefined,
        address: newCustAddress.trim() || undefined,
      });
      targetCust = createdCustomer;
      targetCustId = createdCustomer.id;
    } else {
      targetCust = registeredCustomers.find((c) => c.id === customerId);
    }

    if (!targetCustId || !targetCust) {
      alert('Debe seleccionar o registrar un cliente.');
      return;
    }

    const allSkus = dataStore.getAllSkus();
    const invoiceNum = ''; // el número lo asigna el sistema (correlativo de la base)

    const itemsPayload = invoiceItems.map((it) => {
      const stock = availableSkusList.find((s) => s.skuId === it.skuId);
      const skuData = allSkus.find((s) => s.id === it.skuId);
      const lineSinIva = it.unitPriceSinIva * it.quantity - (it.discountNio || 0);
      const ivaAmount = lineSinIva * ivaRate;
      const lineTotalConIva = lineSinIva + ivaAmount;

      return {
        skuId: it.skuId,
        skuCode: stock?.skuCode || skuData?.skuCode,
        productName: stock?.productName || skuData?.skuDescription,
        size: stock?.size || skuData?.size,
        colorName: stock?.colorName || skuData?.colorName,
        mainImageUrl: skuData?.mainImageUrl || stock?.mainImageUrl,
        quantity: it.quantity,
        regularPriceSinIvaNio: Number(it.regularPriceSinIva.toFixed(2)),
        promoPriceSinIvaNio:
          it.unitPriceSinIva < it.regularPriceSinIva
            ? Number(it.unitPriceSinIva.toFixed(2))
            : undefined,
        unitPriceSinIvaNio: Number(it.unitPriceSinIva.toFixed(2)),
        unitPriceNio: Number(it.unitPriceSinIva.toFixed(2)),
        ivaAmountNio: Number(ivaAmount.toFixed(2)),
        unitCostNio: stock?.costPriceNio || skuData?.costPriceNio || 0,
        discountNio: it.discountNio || 0,
        lineTotalSinIvaNio: Number(lineSinIva.toFixed(2)),
        lineTotalConIvaNio: Number(lineTotalConIva.toFixed(2)),
        lineTotalNio: Number(lineTotalConIva.toFixed(2)),
        itemType: it.itemType || saleType,
      };
    });


    if (paymentTerm === 'credito' && initialPaymentAmount > currentTotals.totalConIvaNio + 0.01) {
      setStockErrors([`El abono inicial no puede superar el total (${formatNIO(currentTotals.totalConIvaNio)}).`]);
      return;
    }

    // Número y recibo los asigna el sistema (correlativos de la base al sincronizar)
    const amountNio = Number(paymentNow.toFixed(2));
    const initialPayments =
      amountNio > 0
        ? [
            {
              id: '',
              invoiceId: '',
              paymentDate: new Date().toISOString(),
              amountNio,
              amountUsd: paymentMethod === 'efectivo_dolares' && exchangeRate > 0
                ? Number((amountNio / exchangeRate).toFixed(2))
                : undefined,
              exchangeRateApplied: paymentMethod === 'efectivo_dolares' ? exchangeRate : undefined,
              paymentMethod,
              notes:
                paymentTerm === 'contado' ? 'Pago completo de contado' : 'Primer abono inicial',
            },
          ]
        : [];

    setSaving(true);
    const effectiveSaleType = (hasPreorderItems || saleType === 'pedido') ? 'pedido' : 'normal';
    const effectiveDeliveryStatus = (hasPreorderItems && deliveryStatus === 'entregado') ? 'pendiente' : deliveryStatus;
    const submitted = await onSubmit({
      invoiceNumber: invoiceNum,
      customerId: targetCustId,
      customerName: targetCust.fullName,
      customerPhone: targetCust.phoneWhatsapp,
      customerIdentification: targetCust.identificationNumber || undefined,
      customerAddress: targetCust.address,
      saleType: effectiveSaleType,
      paymentTerm,
      status: 'pendiente',
      deliveryStatus: effectiveDeliveryStatus,
      trackingRef: trackingRef || undefined,
      deliveryDate:
        effectiveDeliveryStatus === 'entregado' ? new Date().toISOString().split('T')[0] : undefined,
      issueDate: new Date().toISOString().split('T')[0],
      subtotalSinIvaNio: currentTotals.subtotalSinIvaNio,
      subtotalNio: currentTotals.subtotalSinIvaNio,
      discountNio: currentTotals.discountNio,
      ivaRate: currentTotals.ivaRate,
      ivaTotalNio: currentTotals.ivaTotalNio,
      totalConIvaNio: currentTotals.totalConIvaNio,
      totalNio: currentTotals.totalConIvaNio,
      items: itemsPayload as any,
      payments: initialPayments,
      notes,
    });

    setSaving(false);
    if (submitted !== false) {
      onClose();
    }
  };


  const selectedCustomer = useMemo(() => {
    return registeredCustomers.find((c) => c.id === customerId);
  }, [registeredCustomers, customerId]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Emitir Nueva Venta / Factura Comercial"
      subtitle={
        hasIva
          ? 'Desglose automático de IVA 15% (régimen general), control de abonos y entrega.'
          : 'Régimen de cuota fija: precios finales sin desglose de IVA. Control de abonos y entrega.'
      }
      maxWidth="5xl"
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-ink-muted font-bold uppercase tracking-wider">
              {paymentTerm === 'contado' ? 'Total a Cobrar:' : 'Abono Inicial a Cobrar:'}
            </span>
            <span className="text-xl sm:text-2xl font-black text-moss font-mono">
              {formatNIO(paymentNow)}
            </span>
            {paymentTerm === 'credito' && (
              <span className="text-[11px] text-ink-muted bg-surface px-2.5 py-1 rounded-lg border border-moss/10 font-semibold">
                Total Factura: {formatNIO(currentTotals.totalConIvaNio)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-ink-muted hover:text-ink hover:bg-surface rounded-xl transition-colors border border-moss/10"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="new-sale-form"
              disabled={
                saving ||
                invoiceItems.length === 0 ||
                (paymentTerm === 'contado' && isCash && cashReceived > 0 && changeDue < -0.005)
              }
              className="px-5 py-2 text-xs font-bold text-white bg-moss hover:bg-moss-700 disabled:opacity-50 rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              <Receipt className="w-4 h-4" />
              <span>
                {saving
                  ? 'Registrando…'
                  : paymentTerm === 'contado'
                  ? `Cobrar ${formatNIO(paymentNow)}`
                  : 'Emitir Factura a Crédito'}
              </span>
            </button>
          </div>
        </div>
      }
    >
      <form id="new-sale-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Bloque 1: Cliente Receptor */}
        <div className="p-4 bg-surface-soft rounded-2xl border border-moss/15 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-moss/10 flex items-center justify-center text-moss">
                <User className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-ink uppercase tracking-wide">
                  Cliente Receptor
                </h4>
                <p className="text-[11px] text-ink-muted">
                  {customerMode === 'invitado'
                    ? 'Facturación rápida como Cliente Invitado sin pedir datos personales (Solo Contado)'
                    : customerMode === 'nuevo'
                    ? 'Ingrese los datos del nuevo cliente para su registro y entrega'
                    : 'Seleccione un cliente registrado en la tienda'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setCustomerMode('invitado');
                  setPaymentTerm('contado');
                }}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 border ${
                  customerMode === 'invitado'
                    ? 'bg-moss text-white border-moss shadow-xs'
                    : 'bg-white text-ink-muted hover:text-ink border-moss/20'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Invitado (Sin datos)</span>
              </button>

              {registeredCustomers.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerMode('existente');
                    if (!customerId && registeredCustomers[0]) {
                      setCustomerId(registeredCustomers[0].id);
                    }
                  }}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 border ${
                    customerMode === 'existente'
                      ? 'bg-moss text-white border-moss shadow-xs'
                      : 'bg-white text-ink-muted hover:text-ink border-moss/20'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Cliente Existente</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setCustomerMode('nuevo')}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 border ${
                  customerMode === 'nuevo'
                    ? 'bg-moss text-white border-moss shadow-xs'
                    : 'bg-white text-ink-muted hover:text-ink border-moss/20'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Nuevo Cliente</span>
              </button>
            </div>
          </div>

          {customerMode === 'invitado' ? (
            <div className="p-3 bg-white rounded-xl border border-moss/15 flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs">
                <p className="font-bold text-ink">Cliente Invitado (Consumidor Final)</p>
                <p className="text-[11px] text-ink-muted">
                  No se solicitan datos personales. Válido únicamente para ventas <strong className="text-moss">De Contado</strong>.
                </p>
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                Sin datos · Solo Contado
              </span>
            </div>
          ) : customerMode === 'nuevo' || registeredCustomers.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1 animate-in fade-in">
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                  Nombre Completo <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ej. María López"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-moss/20 focus:border-moss font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                  WhatsApp / Teléfono <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ej. +505 8888-8888"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-moss/20 focus:border-moss font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                  Ciudad / Municipio
                </label>
                <input
                  type="text"
                  placeholder="Ej. Managua, Masaya..."
                  value={newCustCity}
                  onChange={(e) => setNewCustCity(e.target.value)}
                  className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-moss/20 focus:border-moss"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                  Cédula / RUC (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej. 001-000000-0000A"
                  value={newCustIdNumber}
                  onChange={(e) => setNewCustIdNumber(e.target.value)}
                  className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-moss/20 focus:border-moss font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                  Dirección de Entrega (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej. De la rotonda 2c al sur, frente a la farmacia"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-moss/20 focus:border-moss"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-1">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                  Cliente Registrado <span className="text-rose-500">*</span>
                </label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-moss/20 focus:border-moss"
                  required
                >
                  <option value="" disabled>Seleccione un cliente...</option>
                  {registeredCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} — Tel: {c.phoneWhatsapp} ({c.city})
                    </option>
                  ))}
                </select>
              </div>

              {selectedCustomer && (
                <div className="p-2.5 bg-white rounded-xl border border-moss/15 text-xs text-ink-muted flex flex-col justify-center">
                  <span className="font-bold text-ink truncate">{selectedCustomer.fullName}</span>
                  <span className="text-[11px] text-moss font-semibold truncate">
                    📞 {selectedCustomer.phoneWhatsapp} · 📍 {selectedCustomer.city}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bloque 2: Condiciones de Venta y Despacho */}
        <div className="p-4 bg-surface-soft rounded-2xl border border-moss/15 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-moss/10 flex items-center justify-center text-moss">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-ink uppercase tracking-wide">
                Condiciones de Venta y Despacho
              </h4>
              <p className="text-[11px] text-ink-muted">Modalidad de inventario, término de pago y entrega</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                Modalidad de Venta
              </label>
              <select
                value={saleType}
                onChange={(e) => {
                  const newType = e.target.value as SaleType;
                  setSaleType(newType);
                  if (newType === 'pedido') {
                    setDeliveryStatus('pendiente');
                  }
                }}
                className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-moss/20 focus:border-moss"
              >
                <option value="normal">Inmediata (Stock Físico)</option>
                <option value="pedido">Bajo Pedido (Apartado / Encargo)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                Término de Cobro
              </label>
              <select
                value={paymentTerm}
                onChange={(e) => {
                  const nextTerm = e.target.value as PaymentTerm;
                  if (nextTerm === 'credito' && customerMode === 'invitado') {
                    setCustomerMode(registeredCustomers.length > 0 ? 'existente' : 'nuevo');
                  }
                  setPaymentTerm(nextTerm);
                }}
                className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-moss/20 focus:border-moss"
              >
                <option value="contado">De Contado (Pago Inmediato)</option>
                <option value="credito" disabled={customerMode === 'invitado'}>
                  {customerMode === 'invitado' ? 'A Crédito 🔒 (Requiere cliente)' : 'A Crédito / En Cuotas'}
                </option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                Estado de Entrega
              </label>
              <select
                value={deliveryStatus}
                onChange={(e) => setDeliveryStatus(e.target.value as DeliveryStatus)}
                className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-moss/20 focus:border-moss"
              >
                {saleType === 'pedido' ? (
                  <>
                    <option value="pendiente">Pendiente de Despacho (En espera)</option>
                    <option value="en_transito" disabled>En Tránsito 🔒 (Requiere recepción)</option>
                    <option value="listo_entrega" disabled>Listo para Entrega 🔒</option>
                    <option value="entregado" disabled>Entregado 🔒</option>
                  </>
                ) : (
                  <>
                    <option value="entregado">Entregado al Cliente (Inmediato)</option>
                    <option value="pendiente">Pendiente de Despacho</option>
                    <option value="en_transito">En Tránsito (Courier / Encomienda)</option>
                    <option value="listo_entrega">Listo para Entrega en Tienda</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                Guía / Tracking de Encomienda
              </label>
              <input
                type="text"
                value={trackingRef}
                onChange={(e) => setTrackingRef(e.target.value)}
                className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-moss/20 focus:border-moss font-mono"
                placeholder="Ej. GUIA-MGA-8839"
              />
            </div>
          </div>
        </div>

        {/* Bloque 3: Artículos y Prendas a Facturar */}
        <div className="space-y-3 relative z-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-moss/10 flex items-center justify-center text-moss">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-ink uppercase tracking-wide">
                  Artículos y Prendas a Facturar
                </h4>
                <p className="text-[11px] text-ink-muted">
                  {invoiceItems.length} {invoiceItems.length === 1 ? 'prenda en la lista' : 'prendas en la lista'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddItemRow}
              className="flex items-center gap-1.5 bg-moss hover:bg-moss-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir Prenda</span>
            </button>
          </div>

          {invoiceItems.length > 0 && (
            <div className="hidden sm:grid sm:grid-cols-12 gap-3 px-3 text-[11px] font-bold text-ink-muted uppercase tracking-wider">
              <div className="sm:col-span-5">SKU / Prenda</div>
              <div className="sm:col-span-2 text-center">Modalidad</div>
              <div className="sm:col-span-2 text-center">Cantidad</div>
              <div className="sm:col-span-2 text-right">{hasIva ? 'Precio Sin IVA' : 'Precio Unitario'}</div>
              <div className="sm:col-span-1 text-center">Acción</div>
            </div>
          )}

          <div className="space-y-2.5">
            {invoiceItems.length === 0 ? (
              <div className="p-6 bg-surface-soft rounded-2xl border border-dashed border-moss/20 text-center text-xs text-ink-muted">
                <ShoppingBag className="w-8 h-8 text-moss/40 mx-auto mb-2" />
                <p className="font-semibold text-ink">No hay prendas agregadas a la factura</p>
                <p className="text-[11px] mt-0.5">Haz clic en &quot;+ Añadir Prenda&quot; para registrar un artículo a cobrar.</p>
              </div>
            ) : (
              invoiceItems.map((item, idx) => {
                const currentStock = availableSkusList.find((s) => s.skuId === item.skuId);
                const isItemPreorder = (item.itemType || saleType) === 'pedido';
                const availableToSell = currentStock
                  ? Math.max(0, currentStock.quantityAvailable - (currentStock.quantityReserved || 0))
                  : 0;
                const maxAllowed = isItemPreorder ? 9999 : Math.max(1, availableToSell);
                const exceedsStock = !isItemPreorder && item.quantity > availableToSell;

                return (
                  <div
                    key={idx}
                    className="p-3 bg-surface rounded-xl border border-moss/10 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center text-xs relative"
                    style={{ zIndex: invoiceItems.length - idx + 10 }}
                  >
                    <div className="sm:col-span-5">
                      <span className="text-[10px] text-ink-muted block font-medium mb-1 sm:hidden">SKU / Prenda</span>
                      <SkuSearchSelect
                        stockList={availableSkusList}
                        products={dataStore.getProducts()}
                        selectedSkuId={item.skuId}
                        onSelectSku={(skuId) => handleUpdateItemRow(idx, 'skuId', skuId)}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <span className="text-[10px] text-ink-muted block font-medium mb-1 sm:hidden">Modalidad</span>
                      <select
                        value={item.itemType || saleType}
                        onChange={(e) => handleUpdateItemRow(idx, 'itemType', e.target.value as SaleType)}
                        className={`w-full border rounded-xl px-2 py-2 text-[11px] font-bold focus:outline-none transition-colors ${
                          (item.itemType || saleType) === 'pedido'
                            ? 'bg-amber-50 text-amber-900 border-amber-300'
                            : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                        }`}
                        title="Venta de stock físico inmediato o bajo pedido / encargo"
                      >
                        <option value="normal">🏪 Stock</option>
                        <option value="pedido">📦 Pedido</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <span className="text-[10px] text-ink-muted block font-medium mb-1 sm:hidden">Cantidad</span>
                      <input
                        type="number"
                        min="1"
                        max={maxAllowed}
                        value={item.quantity}
                        onChange={(e) =>
                          handleUpdateItemRow(idx, 'quantity', parseInt(e.target.value, 10) || 1)
                        }
                        aria-invalid={exceedsStock}
                        className={`w-full bg-white border rounded-xl px-2 py-2 text-xs font-bold text-center focus:outline-none focus:ring-2 ${
                          exceedsStock
                            ? 'border-rose-500 text-rose-700 focus:ring-rose-200'
                            : 'border-moss/20 focus:ring-moss/20 focus:border-moss'
                        }`}
                      />
                      {exceedsStock && (
                        <span className="text-[10px] text-rose-700 font-semibold block mt-0.5 text-center">
                          {availableToSell === 0 ? 'Sin existencia' : `Máx. ${availableToSell}`}
                        </span>
                      )}
                    </div>

                    <div className="sm:col-span-2">
                      <span className="text-[10px] text-ink-muted block font-medium mb-1 sm:hidden">
                        {hasIva ? 'Precio Sin IVA (C$)' : 'Precio Unitario (C$)'}
                      </span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted font-bold text-[11px]">
                          C$
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unitPriceSinIva}
                          onChange={(e) =>
                            handleUpdateItemRow(idx, 'unitPriceSinIva', parseFloat(e.target.value) || 0)
                          }
                          className="w-full bg-white border border-moss/20 rounded-xl pl-8 pr-2.5 py-2 text-xs font-bold text-moss text-right focus:outline-none focus:ring-2 focus:ring-moss/20 focus:border-moss"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-1 flex justify-center">
                      {invoiceItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Eliminar artículo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {stockErrors.length > 0 && (
          <div role="alert" className="p-3 rounded-xl border border-rose-300 bg-rose-50 text-xs text-rose-900 space-y-1">
            <strong className="block">No hay existencia suficiente para una venta inmediata:</strong>
            <ul className="list-disc pl-5">
              {stockErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
            <p>Reduzca la cantidad o cambie la modalidad a &quot;Bajo Pedido&quot; para apartar la mercadería.</p>
          </div>
        )}

        {/* Resumen de Totales y Liquidación */}
        <div className="p-4 bg-surface-soft/90 rounded-2xl border border-moss/15 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs space-y-1 w-full sm:w-auto">
            {hasIva ? (
              <>
                <div className="flex justify-between sm:justify-start gap-4">
                  <span className="text-ink-muted">Subtotal Gravable:</span>
                  <strong className="font-mono text-ink">{formatNIO(currentTotals.subtotalSinIvaNio)}</strong>
                </div>
                <div className="flex justify-between sm:justify-start gap-4">
                  <span className="text-ink-muted">IVA Nicaragua (15%):</span>
                  <strong className="font-mono text-ink-muted">{formatNIO(currentTotals.ivaTotalNio)}</strong>
                </div>
              </>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moss/10 text-moss font-semibold text-[11px]">
                <span>✓ Régimen de cuota fija</span>
                <span className="text-ink-muted font-normal">· Precios finales sin IVA</span>
              </div>
            )}
          </div>

          <div className="text-right w-full sm:w-auto flex flex-row sm:flex-col justify-between sm:justify-center items-center sm:items-end border-t sm:border-t-0 pt-2 sm:pt-0 border-moss/10">
            <span className="text-xs text-ink-muted font-bold uppercase tracking-wider">
              {hasIva ? 'Total Factura' : 'Total a Pagar'}
            </span>
            <div className="text-2xl sm:text-3xl font-black text-moss font-mono tracking-tight">
              {formatNIO(currentTotals.totalConIvaNio)}
            </div>
          </div>
        </div>

        {/* Bloque 4: Método de Cobro y Pago */}
        <div className="p-4 bg-surface-soft rounded-2xl border border-moss/15 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-moss/10 flex items-center justify-center text-moss">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-ink uppercase tracking-wide">
                Liquidación y Método de Pago
              </h4>
              <p className="text-[11px] text-ink-muted">Forma de pago, cálculo de cambio y notas</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                Método de Pago
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-moss/20 focus:border-moss"
              >
                <option value="efectivo_cordobas">Efectivo Córdobas (C$)</option>
                <option value="efectivo_dolares">Efectivo Dólares (US$)</option>
                <option value="transferencia_bancaria">Transferencia Bancaria</option>
                <option value="tarjeta">Tarjeta Débito/Crédito</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            {paymentTerm === 'contado' ? (
              <div>
                <label htmlFor="cash-received" className="block text-[11px] font-semibold text-ink-muted mb-1">
                  {isCash
                    ? `Efectivo Recibido (${paymentMethod === 'efectivo_dolares' ? 'US$' : 'C$'})`
                    : 'Monto de Cobro'}
                </label>
                {isCash ? (
                  <div>
                    <input
                      id="cash-received"
                      type="number"
                      step="0.01"
                      min="0"
                      value={cashReceived || ''}
                      onChange={(e) => setCashReceived(parseFloat(e.target.value) || 0)}
                      placeholder={paymentMethod === 'efectivo_dolares'
                        ? (paymentNow / (exchangeRate || 1)).toFixed(2)
                        : paymentNow.toFixed(2)}
                      className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs font-bold text-moss tabular-nums focus:outline-none focus:ring-2 focus:ring-moss/20 focus:border-moss"
                    />
                    <p className={`text-[11px] mt-1 font-semibold ${changeDue < -0.005 ? 'text-rose-700' : 'text-moss-700'}`}>
                      {cashReceived > 0
                        ? changeDue >= -0.005
                          ? `Vuelto / Cambio: ${formatNIO(changeDue)}`
                          : `Faltan: ${formatNIO(-changeDue)}`
                        : paymentMethod === 'efectivo_dolares'
                          ? `A cobrar: US$ ${(paymentNow / (exchangeRate || 1)).toFixed(2)} (Tasa: C$ ${exchangeRate.toFixed(2)})`
                          : `A cobrar: ${formatNIO(paymentNow)}`}
                    </p>
                  </div>
                ) : (
                  <div className="bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs">
                    <span className="font-bold text-moss font-mono">{formatNIO(paymentNow)}</span>
                    <span className="text-[11px] text-ink-muted block mt-0.5">Cobro completo registrado</span>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label htmlFor="initial-payment" className="block text-[11px] font-semibold text-ink-muted mb-1">
                  Abono Inicial (C$)
                </label>
                <input
                  id="initial-payment"
                  type="number"
                  step="0.01"
                  min="0"
                  max={currentTotals.totalConIvaNio}
                  value={initialPaymentAmount}
                  onChange={(e) => setInitialPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs font-bold text-moss tabular-nums focus:outline-none focus:ring-2 focus:ring-moss/20 focus:border-moss"
                />
                <p className="text-[11px] mt-1 text-ink-muted font-medium">
                  Saldo pendiente a crédito:{' '}
                  <strong className="text-ink">{formatNIO(Math.max(0, currentTotals.totalConIvaNio - initialPaymentAmount))}</strong>
                </p>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                Notas / Observaciones
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-moss/20 focus:border-moss"
                placeholder="Ej. Entregar después de las 3pm"
              />
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
