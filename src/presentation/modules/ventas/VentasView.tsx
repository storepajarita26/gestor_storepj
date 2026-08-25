'use client';

import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Plus,
  Search,
  Trash2,
  FileText,
  Printer,
  CreditCard,
  CheckCircle2,
  Tag,
} from 'lucide-react';
import { StatusBadge } from '@/presentation/components/ui/StatusBadge';
import { Modal } from '@/presentation/components/ui/Modal';
import { InvoicePdfView } from '@/presentation/components/invoice/InvoicePdfView';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { SalesInvoice, Customer, SaleType, PaymentTerm, PaymentMethod } from '@/domain/sales/types';
import { StockLevel } from '@/domain/inventory/types';
import { calculateInvoiceTotals, IVA_RATE_NICARAGUA } from '@/domain/sales/services/invoicingService';

export function VentasView() {
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stockList, setStockList] = useState<StockLevel[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // PDF Viewer Modal State
  const [selectedInvoiceForPdf, setSelectedInvoiceForPdf] = useState<SalesInvoice | null>(null);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);

  // New Invoice Form State (con precios sin IVA y cálculo fiscal)
  const [customerId, setCustomerId] = useState('');
  const [saleType, setSaleType] = useState<SaleType>('normal');
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>('contado');
  const [invoiceItems, setInvoiceItems] = useState<{
    skuId: string;
    quantity: number;
    unitPriceSinIva: number;
    regularPriceSinIva: number;
    discountNio: number;
  }[]>([]);
  const [initialPaymentAmount, setInitialPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo_cordobas');
  const [notes, setNotes] = useState('');

  const refreshData = () => {
    setInvoices(dataStore.getInvoices());
    setCustomers(dataStore.getCustomers());
    setStockList(dataStore.getStock().filter((s) => s.quantityAvailable > 0));
  };

  useEffect(() => {
    refreshData();
    const unsub = dataStore.subscribe(refreshData);
    return unsub;
  }, []);

  const handleOpenNewSale = () => {
    setCustomerId(customers[0]?.id || '');
    if (stockList.length > 0) {
      // Precio base sin IVA = precio catálogo / 1.15
      const baseSinIva = Number((stockList[0].salePriceNio / (1 + IVA_RATE_NICARAGUA)).toFixed(2));
      setInvoiceItems([
        {
          skuId: stockList[0].skuId,
          quantity: 1,
          unitPriceSinIva: baseSinIva,
          regularPriceSinIva: baseSinIva,
          discountNio: 0,
        },
      ]);
      const initialTotalConIva = Number((baseSinIva * (1 + IVA_RATE_NICARAGUA)).toFixed(2));
      setInitialPaymentAmount(initialTotalConIva);
    }
    setIsModalOpen(true);
  };

  const handleAddItemRow = () => {
    if (stockList.length > 0) {
      const baseSinIva = Number((stockList[0].salePriceNio / (1 + IVA_RATE_NICARAGUA)).toFixed(2));
      setInvoiceItems([
        ...invoiceItems,
        {
          skuId: stockList[0].skuId,
          quantity: 1,
          unitPriceSinIva: baseSinIva,
          regularPriceSinIva: baseSinIva,
          discountNio: 0,
        },
      ]);
    }
  };

  const handleViewPdf = (invoice: SalesInvoice) => {
    setSelectedInvoiceForPdf(invoice);
    setIsPdfModalOpen(true);
  };

  // Totales en vivo mientras se llena el formulario
  const currentItemsTotals = calculateInvoiceTotals(
    invoiceItems.map((it) => ({
      skuId: it.skuId,
      quantity: it.quantity,
      unitPriceSinIvaNio: it.unitPriceSinIva,
      regularPriceSinIvaNio: it.regularPriceSinIva,
      unitPriceNio: it.unitPriceSinIva,
      unitCostNio: 0,
      ivaAmountNio: it.unitPriceSinIva * it.quantity * IVA_RATE_NICARAGUA,
      discountNio: it.discountNio,
      lineTotalSinIvaNio: (it.unitPriceSinIva * it.quantity) - it.discountNio,
      lineTotalNio: ((it.unitPriceSinIva * it.quantity) - it.discountNio) * 1.15,
      lineTotalConIvaNio: ((it.unitPriceSinIva * it.quantity) - it.discountNio) * 1.15,
    })) as any
  );

  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || invoiceItems.length === 0) return;

    const cust = customers.find((c) => c.id === customerId);
    const allSkus = dataStore.getAllSkus();
    const invoiceNum = `FAC-${(100 + invoices.length + 1).toString()}`;

    const itemsPayload = invoiceItems.map((it) => {
      const stock = stockList.find((s) => s.skuId === it.skuId);
      const skuData = allSkus.find((s) => s.id === it.skuId);
      const unitPriceSinIva = it.unitPriceSinIva;
      const regularPriceSinIva = it.regularPriceSinIva || unitPriceSinIva;
      const lineTotalSinIva = (unitPriceSinIva * it.quantity) - (it.discountNio || 0);
      const ivaAmount = lineTotalSinIva * IVA_RATE_NICARAGUA;
      const lineTotalConIva = lineTotalSinIva + ivaAmount;

      return {
        skuId: it.skuId,
        skuCode: stock?.skuCode,
        productName: stock?.productName,
        size: stock?.size,
        colorName: stock?.colorName,
        mainImageUrl: skuData?.mainImageUrl,
        quantity: it.quantity,
        regularPriceSinIvaNio: Number(regularPriceSinIva.toFixed(2)),
        promoPriceSinIvaNio: unitPriceSinIva < regularPriceSinIva ? Number(unitPriceSinIva.toFixed(2)) : undefined,
        unitPriceSinIvaNio: Number(unitPriceSinIva.toFixed(2)),
        unitPriceNio: Number(unitPriceSinIva.toFixed(2)),
        ivaAmountNio: Number(ivaAmount.toFixed(2)),
        unitCostNio: stock?.costPriceNio || 0,
        discountNio: it.discountNio || 0,
        lineTotalSinIvaNio: Number(lineTotalSinIva.toFixed(2)),
        lineTotalConIvaNio: Number(lineTotalConIva.toFixed(2)),
        lineTotalNio: Number(lineTotalConIva.toFixed(2)),
      };
    });

    const totals = calculateInvoiceTotals(itemsPayload as any);

    const initialPayments = initialPaymentAmount > 0 ? [
      {
        id: `pay-${Date.now()}`,
        invoiceId: '',
        paymentDate: new Date().toISOString(),
        amountNio: Number(initialPaymentAmount),
        paymentMethod,
        receiptNumber: `REC-${Date.now().toString().slice(-4)}`,
        notes: paymentTerm === 'contado' ? 'Pago completo de contado' : 'Primer abono inicial',
      }
    ] : [];

    const createdInvoice = dataStore.addInvoice({
      invoiceNumber: invoiceNum,
      customerId,
      customerName: cust?.fullName,
      customerPhone: cust?.phoneWhatsapp,
      customerIdentification: cust?.identificationNumber || '001-140598-1002K',
      customerAddress: cust?.address,
      saleType,
      paymentTerm,
      status: 'pendiente',
      issueDate: new Date().toISOString().split('T')[0],
      subtotalSinIvaNio: totals.subtotalSinIvaNio,
      subtotalNio: totals.subtotalSinIvaNio,
      discountNio: totals.discountNio,
      ivaRate: totals.ivaRate,
      ivaTotalNio: totals.ivaTotalNio,
      totalConIvaNio: totals.totalConIvaNio,
      totalNio: totals.totalConIvaNio,
      items: itemsPayload as any,
      payments: initialPayments,
      notes,
    });

    setIsModalOpen(false);

    // Abrir automáticamente el PDF fiscal generado
    setSelectedInvoiceForPdf(createdInvoice);
    setIsPdfModalOpen(true);
  };

  const filteredInvoices = invoices.filter(
    (inv) =>
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.customerName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
            <Receipt className="w-5 h-5 text-moss" />
            Módulo de Ventas & Facturación Fiscal
          </h1>
          <p className="text-xs text-ink-muted">
            Precios de venta y regular sin IVA por línea, cálculo automático de IVA 15% y Total con IVA para exportación a PDF.
          </p>
        </div>

        <button
          onClick={handleOpenNewSale}
          className="flex items-center gap-2 bg-moss hover:bg-moss-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-moss/20"
        >
          <Plus className="w-4 h-4 text-mustard" />
          <span>Nueva Venta & Emitir Factura</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="erp-card p-4 rounded-2xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-surface border border-moss/15 rounded-xl px-3 py-2 w-full sm:w-72 shadow-xs">
          <Search className="w-4 h-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Buscar por número de factura o cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-xs text-ink placeholder-ink-muted focus:outline-none w-full"
          />
        </div>
      </div>

      {/* Invoices List */}
      <div className="erp-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-soft text-ink-muted border-b border-moss/10 font-bold">
              <tr>
                <th className="p-4">Factura #</th>
                <th className="p-4">Cliente</th>
                <th className="p-4 text-center">Tipo Venta</th>
                <th className="p-4 text-center">Término</th>
                <th className="p-4 text-right">Subtotal (Sin IVA)</th>
                <th className="p-4 text-right">IVA (15%)</th>
                <th className="p-4 text-right font-bold text-ink">Total Con IVA (C$)</th>
                <th className="p-4 text-right font-bold text-amber-900">Saldo Pendiente</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acciones PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-moss/10 text-ink">
              {filteredInvoices.map((inv) => {
                const subSinIva = inv.subtotalSinIvaNio ?? (inv.totalNio / 1.15);
                const iva = inv.ivaTotalNio ?? (inv.totalNio - subSinIva);
                const totalConIva = inv.totalConIvaNio ?? inv.totalNio;

                return (
                  <tr key={inv.id} className="hover:bg-surface transition-colors">
                    <td className="p-4 font-bold text-ink font-mono">{inv.invoiceNumber}</td>
                    <td className="p-4">
                      <p className="font-bold text-ink">{inv.customerName}</p>
                      <span className="text-[11px] text-ink-muted">{inv.customerPhone} &bull; {inv.customerIdentification}</span>
                    </td>
                    <td className="p-4 text-center capitalize">
                      <span className="bg-surface border border-moss/15 text-ink px-2 py-0.5 rounded text-[11px] font-semibold">
                        {inv.saleType === 'pedido' ? 'Bajo Pedido' : 'Tienda'}
                      </span>
                    </td>
                    <td className="p-4 text-center capitalize">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          inv.paymentTerm === 'credito'
                            ? 'bg-mustard/30 text-moss-950 border border-mustard/50'
                            : 'bg-emerald-600/10 text-emerald-800 border border-emerald-600/25'
                        }`}
                      >
                        {inv.paymentTerm}
                      </span>
                    </td>
                    <td className="p-4 text-right font-mono text-ink-muted">{formatNIO(subSinIva)}</td>
                    <td className="p-4 text-right font-mono text-ink-muted">+{formatNIO(iva)}</td>
                    <td className="p-4 text-right font-bold font-mono text-ink text-sm">{formatNIO(totalConIva)}</td>
                    <td className="p-4 text-right font-bold text-amber-800">
                      {inv.balanceDueNio > 0 ? formatNIO(inv.balanceDueNio) : 'C$ 0.00'}
                    </td>
                    <td className="p-4 text-center">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleViewPdf(inv)}
                        className="inline-flex items-center gap-1.5 bg-surface hover:bg-surface-soft border border-moss/20 text-ink px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs transition-all hover:border-moss/40"
                        title="Ver e Imprimir Factura Fiscal en PDF"
                      >
                        <Printer className="w-3.5 h-3.5 text-moss" />
                        <span>PDF</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nueva Venta Fiscal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Emitir Nueva Factura Comercial"
        subtitle="Ingresa el precio de venta sin IVA por ítem. El sistema calcula el 15% de IVA y el Total Con IVA automáticamente."
        maxWidth="3xl"
      >
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1">Cliente *</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.identificationNumber || 'Sin Cédula'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1">Tipo de Venta *</label>
              <select
                value={saleType}
                onChange={(e) => setSaleType(e.target.value as SaleType)}
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
              >
                <option value="normal">Venta Normal de Tienda</option>
                <option value="pedido">Bajo Pedido (Shein / Amazon)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1">Condición de Pago *</label>
              <select
                value={paymentTerm}
                onChange={(e) => {
                  const term = e.target.value as PaymentTerm;
                  setPaymentTerm(term);
                  if (term === 'credito') {
                    setInitialPaymentAmount(0);
                  } else {
                    setInitialPaymentAmount(currentItemsTotals.totalConIvaNio);
                  }
                }}
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
              >
                <option value="contado">Contado (Pago Inmediato)</option>
                <option value="credito">Al Crédito (Abonos parciales)</option>
              </select>
            </div>
          </div>

          {/* Items selection con precios sin IVA */}
          <div className="pt-2 border-t border-moss/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-ink">Productos a Facturar (Precios Unitarios Sin IVA)</span>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="text-xs text-moss hover:text-moss-800 font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar Ítem
              </button>
            </div>

            <div className="space-y-2">
              {invoiceItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-surface p-2.5 rounded-xl border border-moss/15 flex-wrap sm:flex-nowrap">
                  <select
                    value={item.skuId}
                    onChange={(e) => {
                      const updated = [...invoiceItems];
                      updated[idx].skuId = e.target.value;
                      const s = stockList.find((st) => st.skuId === e.target.value);
                      if (s) {
                        const baseSinIva = Number((s.salePriceNio / (1 + IVA_RATE_NICARAGUA)).toFixed(2));
                        updated[idx].unitPriceSinIva = baseSinIva;
                        updated[idx].regularPriceSinIva = baseSinIva;
                      }
                      setInvoiceItems(updated);
                    }}
                    className="flex-1 min-w-[200px] bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink"
                  >
                    {stockList.map((s) => (
                      <option key={s.skuId} value={s.skuId}>
                        {s.productName} ({s.skuCode}) - Disp: {s.quantityAvailable} unids
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-ink-muted">Cant:</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="Cant."
                      value={item.quantity}
                      onChange={(e) => {
                        const updated = [...invoiceItems];
                        updated[idx].quantity = parseInt(e.target.value) || 1;
                        setInvoiceItems(updated);
                      }}
                      className="w-14 bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink text-center font-bold"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-ink-muted">P. Reg (Sin IVA):</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="P. Regular"
                      value={item.regularPriceSinIva}
                      onChange={(e) => {
                        const updated = [...invoiceItems];
                        updated[idx].regularPriceSinIva = parseFloat(e.target.value) || 0;
                        setInvoiceItems(updated);
                      }}
                      className="w-20 bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink text-right font-medium"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold text-moss">P. Venta (Sin IVA):</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="P. Venta"
                      value={item.unitPriceSinIva}
                      onChange={(e) => {
                        const updated = [...invoiceItems];
                        updated[idx].unitPriceSinIva = parseFloat(e.target.value) || 0;
                        setInvoiceItems(updated);
                      }}
                      className="w-24 bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink text-right font-bold text-moss-800"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setInvoiceItems(invoiceItems.filter((_, i) => i !== idx))}
                    className="p-1 text-ink-muted hover:text-rose-600 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Desglose de Totales en Tiempo Real */}
          <div className="p-3.5 bg-surface rounded-xl border border-moss/15 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-white p-2 rounded-lg border border-moss/10">
              <span className="text-[10px] text-ink-muted block font-semibold">Subtotal (Sin IVA)</span>
              <strong className="text-ink text-xs">{formatNIO(currentItemsTotals.subtotalSinIvaNio)}</strong>
            </div>
            <div className="bg-white p-2 rounded-lg border border-moss/10">
              <span className="text-[10px] text-ink-muted block font-semibold">IVA Fiscal (15%)</span>
              <strong className="text-sky-800 text-xs">+{formatNIO(currentItemsTotals.ivaTotalNio)}</strong>
            </div>
            <div className="bg-moss/10 p-2 rounded-lg border border-moss/20">
              <span className="text-[10px] text-moss uppercase block font-bold">TOTAL CON IVA</span>
              <strong className="text-moss text-sm font-extrabold">{formatNIO(currentItemsTotals.totalConIvaNio)}</strong>
            </div>
          </div>

          {/* Initial Payment */}
          <div className="pt-2 border-t border-moss/10 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1">
                {paymentTerm === 'contado' ? 'Monto Cobrado Contado (Con IVA)' : 'Monto Primer Abono (C$)'}
              </label>
              <input
                type="number"
                step="0.01"
                value={initialPaymentAmount}
                onChange={(e) => setInitialPaymentAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink font-bold text-moss-800 focus:outline-none focus:border-moss"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1">Método de Pago</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
              >
                <option value="efectivo_cordobas">Efectivo Córdobas</option>
                <option value="efectivo_dolares">Efectivo Dólares</option>
                <option value="transferencia_bancaria">Transferencia Bancaria (BAC/Lafise/Banpro)</option>
                <option value="tarjeta">Tarjeta Débito/Crédito</option>
              </select>
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
              Emitir Factura y Generar PDF
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Visor de Factura en PDF */}
      {isPdfModalOpen && selectedInvoiceForPdf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-blue-900/20 max-w-4xl w-full overflow-hidden">
            <InvoicePdfView
              invoice={selectedInvoiceForPdf}
              onClose={() => setIsPdfModalOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
