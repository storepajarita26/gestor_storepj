'use client';

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  Clock,
  CheckCircle2,
  History,
} from 'lucide-react';
import { StatusBadge } from '@/presentation/components/ui/StatusBadge';
import { Modal } from '@/presentation/components/ui/Modal';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { SalesInvoice, PaymentMethod } from '@/domain/sales/types';

export function CreditosView() {
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // New Payment Form
  const [paymentAmountNio, setPaymentAmountNio] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo_cordobas');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  const refreshData = () => {
    setInvoices(dataStore.getInvoices());
  };

  useEffect(() => {
    refreshData();
    const unsub = dataStore.subscribe(refreshData);
    return unsub;
  }, []);

  const handleOpenPaymentModal = (invoice: SalesInvoice) => {
    setSelectedInvoice(invoice);
    setPaymentAmountNio(invoice.balanceDueNio > 500 ? 500 : invoice.balanceDueNio);
    setReceiptNumber(`REC-${Date.now().toString().slice(-4)}`);
    setReferenceNumber('');
    setNotes('');
    setIsPaymentModalOpen(true);
  };

  const handleOpenHistoryModal = (invoice: SalesInvoice) => {
    setSelectedInvoice(invoice);
    setIsHistoryModalOpen(true);
  };

  const handleRegisterPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || paymentAmountNio <= 0) return;

    dataStore.registerPayment({
      invoiceId: selectedInvoice.id,
      amountNio: Number(paymentAmountNio),
      paymentMethod,
      receiptNumber,
      referenceNumber,
      notes,
    });

    setIsPaymentModalOpen(false);
  };

  const creditInvoices = invoices.filter(
    (inv) =>
      inv.paymentTerm === 'credito' ||
      inv.balanceDueNio > 0 ||
      (inv.payments && inv.payments.length > 0)
  );

  const filteredCreditInvoices = creditInvoices.filter(
    (inv) =>
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.customerName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalOutstanding = creditInvoices.reduce((acc, inv) => acc + (inv.balanceDueNio || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Metric */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-moss" />
            Gestión de Cuentas por Cobrar & Abonos en Cuotas
          </h1>
          <p className="text-xs text-ink-muted">
            Control de clientes que pagan en 3 o 4 cuotas. Registro de abonos por factura y actualización de saldos.
          </p>
        </div>

        <div className="erp-card px-5 py-3 rounded-2xl border border-mustard/40 bg-mustard/15 flex items-center gap-4 shadow-sm">
          <div className="p-2.5 rounded-xl bg-mustard text-moss-950 font-bold shadow-xs">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-extrabold text-moss-900 tracking-wider">
              Saldo Total por Cobrar
            </span>
            <p className="text-xl font-extrabold text-ink">{formatNIO(totalOutstanding)}</p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="erp-card p-4 rounded-2xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-surface border border-moss/15 rounded-xl px-3 py-2 w-full sm:w-72 shadow-xs">
          <Search className="w-4 h-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Buscar por cliente o factura..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-xs text-ink placeholder-ink-muted focus:outline-none w-full"
          />
        </div>
      </div>

      {/* Credit Invoices Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredCreditInvoices.length === 0 ? (
          <div className="col-span-2 erp-card p-8 text-center rounded-2xl">
            <CheckCircle2 className="w-8 h-8 text-moss mx-auto mb-2" />
            <p className="text-sm font-bold text-ink">No hay cuentas pendientes de cobro</p>
          </div>
        ) : (
          filteredCreditInvoices.map((inv) => {
            const percentagePaid = inv.totalNio > 0 ? Math.round((inv.amountPaidNio / inv.totalNio) * 100) : 100;

            return (
              <div key={inv.id} className="erp-card rounded-2xl p-5 hover:border-moss/30 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between pb-3 border-b border-moss/10">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-ink">{inv.invoiceNumber}</span>
                        <StatusBadge status={inv.status} />
                      </div>
                      <h3 className="font-bold text-sm text-ink mt-1">{inv.customerName}</h3>
                      <p className="text-xs text-ink-muted">{inv.customerPhone} &bull; {inv.customerAddress}</p>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-ink-muted block font-bold">Total Factura</span>
                      <span className="font-extrabold text-ink text-sm">{formatNIO(inv.totalNio)}</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-ink-muted">
                        Abonado: <strong className="text-emerald-800 font-bold">{formatNIO(inv.amountPaidNio)}</strong>
                      </span>
                      <span className="font-bold text-amber-800">
                        Saldo: {formatNIO(inv.balanceDueNio)}
                      </span>
                    </div>
                    <div className="w-full bg-surface-soft rounded-full h-2 overflow-hidden border border-moss/15">
                      <div
                        className="bg-moss h-full rounded-full transition-all duration-300"
                        style={{ width: `${percentagePaid}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-ink-muted mt-1 font-medium">
                      <span>{inv.payments.length} abonos realizados</span>
                      <span className="font-bold text-ink">{percentagePaid}% completado</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-4 mt-4 border-t border-moss/10 flex items-center justify-between gap-3">
                  <button
                    onClick={() => handleOpenHistoryModal(inv)}
                    className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink font-bold py-1.5 px-2.5 rounded-lg hover:bg-surface transition-all"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Ver Abonos ({inv.payments.length})</span>
                  </button>

                  {inv.balanceDueNio > 0 ? (
                    <button
                      onClick={() => handleOpenPaymentModal(inv)}
                      className="flex items-center gap-1.5 bg-moss hover:bg-moss-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-md shadow-moss/20"
                    >
                      <Plus className="w-3.5 h-3.5 text-mustard" />
                      <span>Registrar Abono</span>
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Pagada al 100%
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Registrar Abono */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={`Registrar Abono - Factura ${selectedInvoice?.invoiceNumber}`}
        subtitle={`Cliente: ${selectedInvoice?.customerName} | Saldo Pendiente: ${formatNIO(selectedInvoice?.balanceDueNio || 0)}`}
        maxWidth="md"
      >
        <form onSubmit={handleRegisterPayment} className="space-y-4">
          <div>
            <label className="text-[11px] font-bold text-ink-muted block mb-1">Monto del Abono (C$) *</label>
            <input
              type="number"
              step="0.01"
              max={selectedInvoice?.balanceDueNio || 999999}
              required
              value={paymentAmountNio}
              onChange={(e) => setPaymentAmountNio(parseFloat(e.target.value) || 0)}
              className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-sm text-ink font-bold text-moss-800 focus:outline-none focus:border-moss"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-ink-muted block mb-1">Método de Pago *</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
            >
              <option value="efectivo_cordobas">Efectivo Córdobas</option>
              <option value="efectivo_dolares">Efectivo Dólares</option>
              <option value="transferencia_bancaria">Transferencia Bancaria (BAC/Lafise/Banpro)</option>
              <option value="tarjeta">Tarjeta Débito/Crédito</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1"># Recibo / Comprobante</label>
              <input
                type="text"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1"># Referencia Bancaria</label>
              <input
                type="text"
                placeholder="BAC-9482..."
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-ink-muted block mb-1">Notas del Abono</label>
            <input
              type="text"
              placeholder="Ej: Abono 2 de 3 acordado en quincena"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink"
            />
          </div>

          <div className="pt-4 border-t border-moss/10 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-moss hover:bg-moss-700 text-white shadow-md shadow-moss/20"
            >
              Registrar Abono & Actualizar Saldo
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Historial de Abonos */}
      <Modal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        title={`Historial de Abonos: Factura ${selectedInvoice?.invoiceNumber}`}
        subtitle={`Cliente: ${selectedInvoice?.customerName} | Total: ${formatNIO(selectedInvoice?.totalNio || 0)}`}
        maxWidth="lg"
      >
        <div className="space-y-3">
          {selectedInvoice?.payments && selectedInvoice.payments.length > 0 ? (
            selectedInvoice.payments.map((p, idx) => (
              <div key={p.id || idx} className="bg-surface p-3 rounded-xl border border-moss/15 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-moss-800">{formatNIO(p.amountNio)}</span>
                    <span className="text-ink-muted">&bull; {p.paymentMethod.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-[11px] text-ink-muted mt-0.5 font-mono">
                    Recibo: {p.receiptNumber} {p.referenceNumber && `| Ref: ${p.referenceNumber}`}
                  </p>
                  {p.notes && <p className="text-[11px] text-ink mt-0.5">{p.notes}</p>}
                </div>
                <span className="text-[10px] text-ink-muted font-mono">
                  {new Date(p.paymentDate).toLocaleDateString('es-NI')}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-ink-muted text-center py-4">No hay abonos registrados para esta factura.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
