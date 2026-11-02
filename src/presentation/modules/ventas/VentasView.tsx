'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { SalesInvoice, DeliveryStatus, ReturnInput } from '@/domain/sales/types';
import { useToast } from '@/presentation/components/ui/Toast';
import { useDeepLink } from '@/presentation/hooks/useDeepLink';
import { Modal } from '@/presentation/components/ui/Modal';
import { InvoicePdfView } from '@/presentation/components/invoice/InvoicePdfView';
import { exportInvoicesToCsv } from '@/domain/shared/utils/exportUtils';
import { SalesStatsCards } from './components/SalesStatsCards';
import { SalesFiltersBar } from './components/SalesFiltersBar';
import { SalesTable } from './components/SalesTable';
import { DeliveryStatusModal } from './components/DeliveryStatusModal';
import { VoidInvoiceModal } from './components/VoidInvoiceModal';
import { ReturnModal } from './components/ReturnModal';

export function VentasView() {
  const toast = useToast();
  const router = useRouter();

  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [deliveryFilter, setDeliveryFilter] = useState<'todos' | DeliveryStatus>('todos');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Modals
  const [deliveryModalInvoice, setDeliveryModalInvoice] = useState<SalesInvoice | null>(null);
  const [selectedInvoiceForPdf, setSelectedInvoiceForPdf] = useState<SalesInvoice | null>(null);
  const [voidInvoice, setVoidInvoice] = useState<SalesInvoice | null>(null);
  const [returnInvoice, setReturnInvoice] = useState<SalesInvoice | null>(null);

  /** Muestra el resultado de una operación con un mensaje honesto sobre la sincronización */
  const notifyResult = (res: { success: boolean; message: string; sync: string }, title: string) => {
    if (!res.success) toast.error(res.message, title);
    else if (res.sync === 'pending') toast.warning(res.message, title);
    else toast.success(res.message, title);
  };

  const refreshData = () => {
    setInvoices(dataStore.getInvoices());
  };

  useEffect(() => {
    refreshData();
    const unsub = dataStore.subscribe(refreshData);
    return unsub;
  }, []);

  // Búsqueda global / ficha de cliente: /ventas?factura=<id> abre la factura
  useDeepLink(
    'factura',
    (id) => {
      const inv = dataStore.getInvoices().find((i) => i.id === id);
      if (inv) setSelectedInvoiceForPdf(inv);
    },
    invoices.length > 0
  );

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesDelivery =
        deliveryFilter === 'todos' ? true : inv.deliveryStatus === deliveryFilter;

      if (!matchesDelivery) return false;

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesNumber = inv.invoiceNumber.toLowerCase().includes(query);
        const matchesCustomer = (inv.customerName || '').toLowerCase().includes(query);
        const matchesTracking = (inv.trackingRef || '').toLowerCase().includes(query);
        return matchesNumber || matchesCustomer || matchesTracking;
      }

      return true;
    });
  }, [invoices, deliveryFilter, searchTerm]);

  // Paginated slice
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredInvoices.slice(start, start + itemsPerPage);
  }, [filteredInvoices, currentPage, itemsPerPage]);

  const handleSaveDeliveryStatus = async (
    invoiceId: string,
    status: DeliveryStatus,
    notes?: string,
    trackingRef?: string
  ) => {
    const res = await dataStore.updateInvoiceDeliveryStatus(invoiceId, status, notes, trackingRef);
    notifyResult(res, res.success ? 'Despacho actualizado' : 'No se pudo despachar');
    if (res.success) setDeliveryModalInvoice(null);
    return res.success;
  };

  const handleVoid = async (invoiceId: string, reason: string) => {
    const res = await dataStore.voidInvoice(invoiceId, reason);
    notifyResult(res, res.success ? 'Factura anulada' : 'No se pudo anular');
    return res.success;
  };

  const handleReturn = async (input: ReturnInput) => {
    const res = await dataStore.registerReturn(input);
    notifyResult(res, res.success ? 'Devolución registrada' : 'No se pudo registrar la devolución');
    return res.success;
  };

  const handleExportInvoices = () => {
    exportInvoicesToCsv(invoices, { includeIva: dataStore.getIvaRate() > 0 });
    toast.info('Reporte Excel de ventas descargado con éxito.');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Filters & Actions Bar */}
      <SalesFiltersBar
        searchTerm={searchTerm}
        onSearchChange={(term) => {
          setSearchTerm(term);
          setCurrentPage(1);
        }}
        deliveryFilter={deliveryFilter}
        onDeliveryFilterChange={(status) => {
          setDeliveryFilter(status);
          setCurrentPage(1);
        }}
        onOpenNewSale={() => router.push('/vender')}
        onExportInvoices={handleExportInvoices}
      />

      {/* KPI Stats Cards */}
      <SalesStatsCards invoices={invoices} />

      {/* Paginated Invoices Table */}
      <SalesTable
        invoices={paginatedInvoices}
        totalInvoices={filteredInvoices.length}
        currentPage={currentPage}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
        onItemsPerPageChange={setItemsPerPage}
        onViewPdf={(inv) => setSelectedInvoiceForPdf(inv)}
        onUpdateDelivery={(inv) => setDeliveryModalInvoice(inv)}
        onVoid={(inv) => setVoidInvoice(inv)}
        onReturn={(inv) => setReturnInvoice(inv)}
      />

      <VoidInvoiceModal invoice={voidInvoice} onClose={() => setVoidInvoice(null)} onConfirm={handleVoid} />
      <ReturnModal invoice={returnInvoice} onClose={() => setReturnInvoice(null)} onConfirm={handleReturn} />

      {/* Delivery Quick Update Modal */}
      <DeliveryStatusModal
        isOpen={Boolean(deliveryModalInvoice)}
        onClose={() => setDeliveryModalInvoice(null)}
        invoice={deliveryModalInvoice}
        onSave={handleSaveDeliveryStatus}
      />

      {/* Invoice PDF Fiscal Modal */}
      <Modal
        isOpen={Boolean(selectedInvoiceForPdf)}
        onClose={() => setSelectedInvoiceForPdf(null)}
        title={`Factura Fiscal: ${selectedInvoiceForPdf?.invoiceNumber || ''}`}
        subtitle={
          dataStore.getIvaRate() > 0
            ? 'Formato oficial con desglose de IVA 15% y estado de entrega'
            : 'Régimen de cuota fija: precios finales sin desglose de IVA, con estado de entrega'
        }
        maxWidth="3xl"
      >
        {selectedInvoiceForPdf && (
          <InvoicePdfView invoice={selectedInvoiceForPdf} />
        )}
      </Modal>
    </div>
  );
}
