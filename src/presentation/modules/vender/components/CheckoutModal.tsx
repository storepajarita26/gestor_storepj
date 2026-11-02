'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, DollarSign, ArrowLeftRight, CreditCard, AlertTriangle } from 'lucide-react';
import { Modal } from '@/presentation/components/ui/Modal';
import { Customer, DeliveryStatus, PaymentMethod, PaymentTerm, SaleType } from '@/domain/sales/types';
import { CartLine, CheckoutInput } from '@/domain/sales/services/saleBuilder';
import { addDays, toIsoDate } from '@/domain/sales/services/customerService';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { dataStore } from '@/infrastructure/repositories/dataStore';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  lines: CartLine[];
  total: number;
  customer: Customer;
  isWalkIn: boolean;
  /** Elegir otro cliente (para vender a crédito hace falta uno con nombre) */
  onChangeCustomer: () => void;
  /** Devuelve un mensaje de error, o null si la venta se registró */
  onConfirm: (input: CheckoutInput) => Promise<string | null>;
}

type DeliveryChoice = 'se_lo_lleva' | 'envio' | 'retira_despues';

const METHODS: { value: PaymentMethod; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'efectivo_cordobas', label: 'Efectivo C$', icon: Banknote },
  { value: 'efectivo_dolares', label: 'Efectivo US$', icon: DollarSign },
  { value: 'transferencia_bancaria', label: 'Transferencia', icon: ArrowLeftRight },
  { value: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
];

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-bold text-ink-muted uppercase tracking-wide mb-1.5">{label}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={opt.disabled}
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={`px-3 py-2 rounded-xl border text-sm text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                active ? 'border-moss bg-moss text-white' : 'border-moss/20 bg-white text-ink hover:border-moss/50'
              }`}
            >
              <span className="block font-bold">{opt.label}</span>
              {opt.hint && <span className={`block text-xs ${active ? 'text-white/80' : 'text-ink-muted'}`}>{opt.hint}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Paso de cobro: condiciones de la venta, forma de pago y vuelto */
export function CheckoutModal({ isOpen, onClose, lines, total, customer, isWalkIn, onChangeCustomer, onConfirm }: CheckoutModalProps) {
  const exchangeRate = dataStore.getExchangeRate();
  const creditDays = dataStore.getDefaultCreditDays();

  const [saleType, setSaleType] = useState<SaleType>('normal');
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>('contado');
  const [delivery, setDelivery] = useState<DeliveryChoice>('se_lo_lleva');
  const [trackingRef, setTrackingRef] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [initialPayment, setInitialPayment] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('efectivo_cordobas');
  const [received, setReceived] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const receivedRef = useRef<HTMLInputElement>(null);

  // Qué líneas no alcanzan para una venta inmediata
  const shortages = useMemo(() => {
    const requested = new Map<string, { qty: number; line: CartLine }>();
    lines.forEach((l) => {
      const prev = requested.get(l.skuId);
      requested.set(l.skuId, { qty: (prev?.qty || 0) + l.quantity, line: l });
    });
    return Array.from(requested.entries())
      .map(([skuId, r]) => ({ ...r, available: dataStore.getAvailableToSell(skuId) }))
      .filter((r) => r.qty > r.available);
  }, [lines, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    const preorder = shortages.length > 0 && shortages.length === new Set(lines.map((l) => l.skuId)).size;
    setSaleType(preorder ? 'pedido' : 'normal');
    setPaymentTerm('contado');
    setDelivery('se_lo_lleva');
    setTrackingRef('');
    setDueDate(addDays(toIsoDate(new Date()), creditDays));
    setInitialPayment('');
    setMethod('efectivo_cordobas');
    setReceived('');
    setReference('');
    setNotes('');
    setError(null);
    setSaving(false);
    setTimeout(() => receivedRef.current?.focus(), 50);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si es Cliente Invitado (sin datos), siempre forzar Contado
  useEffect(() => {
    if (isWalkIn && paymentTerm === 'credito') {
      setPaymentTerm('contado');
    }
  }, [isWalkIn, paymentTerm]);

  const isCredit = paymentTerm === 'credito';
  const initialNio = Math.min(Math.max(0, parseFloat(initialPayment) || 0), total);
  const payNow = isCredit ? initialNio : total;
  const isCash = method === 'efectivo_cordobas' || method === 'efectivo_dolares';
  const isUsd = method === 'efectivo_dolares';
  const receivedNum = parseFloat(received) || 0;
  const receivedNio = isUsd ? receivedNum * exchangeRate : receivedNum;
  const change = isCash && receivedNum > 0 ? receivedNio - payNow : 0;
  const missing = isCash && receivedNum > 0 && change < -0.005;
  const payNowUsd = exchangeRate > 0 ? payNow / exchangeRate : 0;

  const blockingStock = saleType === 'normal' && shortages.length > 0;
  const blockingCredit = isCredit && isWalkIn;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (blockingStock) {
      setError('Hay prendas sin existencia suficiente. Cambie a "Pedido" o ajuste las cantidades.');
      return;
    }
    if (blockingCredit) {
      setError('Para vender a crédito elija o cree el cliente (nombre y teléfono).');
      return;
    }
    if (missing) {
      setError(`Falta dinero: recibió ${formatNIO(receivedNio)} y el cobro es ${formatNIO(payNow)}.`);
      return;
    }
    if (isCredit && !dueDate) {
      setError('Indique la fecha de vencimiento del crédito.');
      return;
    }
    const deliveryStatus: DeliveryStatus =
      saleType === 'pedido' ? 'pendiente' : delivery === 'envio' ? 'en_transito' : delivery === 'retira_despues' ? 'listo_entrega' : 'entregado';

    setSaving(true);
    setError(null);
    const message = await onConfirm({
      customer,
      saleType,
      paymentTerm,
      deliveryStatus,
      trackingRef: delivery === 'envio' || saleType === 'pedido' ? trackingRef.trim() || undefined : undefined,
      dueDate: isCredit ? dueDate : undefined,
      paymentNowNio: payNow,
      paymentMethod: method,
      exchangeRate,
      referenceNumber: !isCash ? reference.trim() || undefined : undefined,
      notes: [notes.trim(), isCash && receivedNum > 0 && change > 0.005 ? `Recibido ${isUsd ? `US$ ${receivedNum.toFixed(2)}` : formatNIO(receivedNum)}, vuelto ${formatNIO(change)}` : '']
        .filter(Boolean)
        .join(' · ') || undefined,
      ivaRate: dataStore.getIvaRate(),
      issueDate: toIsoDate(new Date()),
    });
    setSaving(false);
    if (message) setError(message);
  };

  const quickBills = isUsd ? [5, 10, 20, 50, 100] : [100, 200, 500, 1000];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Cobrar ${formatNIO(total)}`}
      subtitle={`${lines.reduce((a, l) => a + l.quantity, 0)} prendas · ${isWalkIn ? 'Cliente Invitado (Sin datos)' : customer.fullName}`}
      maxWidth="2xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-ink-muted hover:text-ink">
            Volver <kbd className="ml-1 text-[10px] border border-moss/15 rounded px-1">Esc</kbd>
          </button>
          <button
            type="submit"
            form="pos-checkout"
            disabled={saving || blockingStock || blockingCredit}
            className="px-6 py-3 text-base font-bold text-white bg-moss hover:bg-moss-700 rounded-xl shadow-md disabled:opacity-50"
          >
            {saving ? 'Registrando…' : isCredit ? `Facturar a crédito` : `Cobrar ${formatNIO(payNow)}`}
            <kbd className="ml-2 text-[10px] bg-white/15 rounded px-1.5 py-0.5 font-semibold">Enter</kbd>
          </button>
        </div>
      }
    >
      <form id="pos-checkout" onSubmit={handleSubmit} className="space-y-5">
        {/* Resumen de Cliente (Invitado vs Registrado) */}
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-surface-soft border border-moss/15">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
              Facturando a
            </p>
            <p className="text-sm font-bold text-ink truncate">
              {isWalkIn ? 'Cliente Invitado (Consumidor Final)' : customer.fullName}
            </p>
            <p className="text-xs text-ink-muted">
              {isWalkIn
                ? 'Facturación rápida sin pedir datos personales · Exclusivo de Contado'
                : `${customer.phoneWhatsapp ? `Tel: ${customer.phoneWhatsapp} · ` : ''}${customer.city || 'Managua'}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onChangeCustomer}
            className="shrink-0 px-3 py-1.5 rounded-xl border border-moss/25 bg-white hover:bg-moss/5 text-xs font-bold text-moss transition-colors"
          >
            {isWalkIn ? 'Asignar cliente' : 'Cambiar'}
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Segmented<SaleType>
            label="Tipo de venta"
            value={saleType}
            onChange={setSaleType}
            options={[
              { value: 'normal', label: 'Inmediata', hint: 'Sale de bodega ahora' },
              { value: 'pedido', label: 'Pedido', hint: 'Aparta o encarga' },
            ]}
          />
          <div>
            <Segmented<PaymentTerm>
              label="Pago"
              value={paymentTerm}
              onChange={setPaymentTerm}
              options={[
                { value: 'contado', label: 'Contado', hint: 'Paga todo hoy' },
                {
                  value: 'credito',
                  label: 'Crédito',
                  hint: isWalkIn ? 'Solo con cliente registrado' : `Vence en ${creditDays} días`,
                  disabled: isWalkIn,
                },
              ]}
            />
            {isWalkIn && (
              <p className="mt-1 text-[11px] text-ink-muted">
                ¿Venta al crédito?{' '}
                <button type="button" onClick={onChangeCustomer} className="font-bold text-moss underline hover:text-moss-700">
                  Seleccione o registre un cliente
                </button>
              </p>
            )}
          </div>
        </div>

        {blockingStock && (
          <div role="alert" className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-900">
            <p className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" aria-hidden="true" /> No hay existencia suficiente para venta inmediata
            </p>
            <ul className="list-disc pl-5 mt-1">
              {shortages.map((s) => (
                <li key={s.line.skuId}>
                  {s.line.skuCode} {s.line.productName}: lleva {s.qty}, disponible {s.available}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setSaleType('pedido')} className="mt-2 font-bold underline">
              Registrar como pedido (apartado)
            </button>
          </div>
        )}

        {blockingCredit && (
          <div role="alert" className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-900">
            Para vender a crédito necesita un cliente con nombre y teléfono.{' '}
            <button type="button" onClick={onChangeCustomer} className="font-bold underline">
              Elegir cliente
            </button>
          </div>
        )}

        {/* Entrega */}
        {saleType === 'normal' ? (
          <Segmented<DeliveryChoice>
            label="Entrega"
            value={delivery}
            onChange={setDelivery}
            options={[
              { value: 'se_lo_lleva', label: 'Se lo lleva' },
              { value: 'envio', label: 'Envío' },
              { value: 'retira_despues', label: 'Retira después' },
            ]}
          />
        ) : (
          <p className="text-sm text-ink-muted bg-surface rounded-xl px-3 py-2">
            El pedido queda <strong className="text-ink">pendiente de despacho</strong> y la mercadería disponible se aparta.
            Al entregarlo, márquelo en Ventas.
          </p>
        )}
        {(delivery === 'envio' && saleType === 'normal') && (
          <div>
            <label htmlFor="pos-tracking" className="block text-xs font-bold text-ink-muted mb-1">Guía de envío (opcional)</label>
            <input
              id="pos-tracking"
              value={trackingRef}
              onChange={(e) => setTrackingRef(e.target.value)}
              className="w-full border border-moss/20 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-moss/30"
              placeholder="Ej. GUIA-MGA-8839"
            />
          </div>
        )}

        {/* Crédito */}
        {isCredit && (
          <div className="grid sm:grid-cols-2 gap-4 p-3 rounded-xl bg-surface-soft border border-moss/10">
            <div>
              <label htmlFor="pos-due" className="block text-xs font-bold text-ink-muted mb-1">Vence el</label>
              <input
                id="pos-due"
                type="date"
                value={dueDate}
                min={toIsoDate(new Date())}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border border-moss/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-moss/30"
              />
              <div className="flex gap-1.5 mt-1.5">
                {[15, 30, 45, 60].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDueDate(addDays(toIsoDate(new Date()), d))}
                    className={`px-2 py-0.5 rounded-lg text-xs font-semibold border ${
                      dueDate === addDays(toIsoDate(new Date()), d) ? 'bg-moss text-white border-moss' : 'border-moss/20 text-ink hover:bg-white'
                    }`}
                  >
                    {d} días
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="pos-initial" className="block text-xs font-bold text-ink-muted mb-1">Abono inicial (C$)</label>
              <input
                id="pos-initial"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                max={total}
                value={initialPayment}
                onChange={(e) => setInitialPayment(e.target.value)}
                placeholder="0.00"
                className="w-full border border-moss/20 rounded-xl px-3 py-2 text-sm font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-moss/30"
              />
              <p className="text-xs text-ink-muted mt-1">
                Queda debiendo <strong className="text-ink">{formatNIO(total - initialNio)}</strong>
              </p>
            </div>
          </div>
        )}

        {/* Forma de pago */}
        {payNow > 0 && (
          <fieldset>
            <legend className="text-xs font-bold text-ink-muted uppercase tracking-wide mb-1.5">Forma de pago</legend>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {METHODS.map((m) => {
                const Icon = m.icon;
                const active = method === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setMethod(m.value);
                      setReceived('');
                    }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-bold ${
                      active ? 'border-moss bg-moss text-white' : 'border-moss/20 bg-white text-ink hover:border-moss/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                    {m.label}
                  </button>
                );
              })}
            </div>

            {isCash ? (
              <div className="mt-3 grid sm:grid-cols-2 gap-4 items-start">
                <div>
                  <label htmlFor="pos-received" className="block text-xs font-bold text-ink-muted mb-1">
                    Recibido ({isUsd ? 'US$' : 'C$'})
                  </label>
                  <input
                    id="pos-received"
                    ref={receivedRef}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={received}
                    onChange={(e) => setReceived(e.target.value)}
                    placeholder={isUsd ? payNowUsd.toFixed(2) : payNow.toFixed(2)}
                    className="w-full border border-moss/20 rounded-xl px-3 py-2.5 text-lg font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-moss/30"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <button type="button" onClick={() => setReceived('')} className="px-2 py-0.5 rounded-lg text-xs font-semibold border border-moss/20 hover:bg-surface">
                      Exacto
                    </button>
                    {quickBills
                      .filter((b) => b >= (isUsd ? payNowUsd : payNow) * 0.5)
                      .slice(0, 4)
                      .map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setReceived(String(b))}
                          className="px-2 py-0.5 rounded-lg text-xs font-semibold border border-moss/20 hover:bg-surface"
                        >
                          {isUsd ? `US$ ${b}` : `C$ ${b}`}
                        </button>
                      ))}
                  </div>
                  {isUsd && <p className="text-xs text-ink-muted mt-1">Tasa C$ {exchangeRate.toFixed(2)} · a cobrar US$ {payNowUsd.toFixed(2)}</p>}
                </div>
                <div className={`rounded-xl p-3 text-center ${missing ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-900'}`} aria-live="polite">
                  <p className="text-xs font-bold uppercase tracking-wide">{missing ? 'Falta' : 'Vuelto'}</p>
                  <p className="text-3xl font-black tabular-nums">{formatNIO(receivedNum > 0 ? Math.abs(change) : 0)}</p>
                  {receivedNum === 0 && <p className="text-xs">Pago exacto</p>}
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <label htmlFor="pos-ref" className="block text-xs font-bold text-ink-muted mb-1">
                  N.º de referencia (opcional)
                </label>
                <input
                  id="pos-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full border border-moss/20 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-moss/30"
                  placeholder="Ej. 004512"
                />
              </div>
            )}
          </fieldset>
        )}

        <div>
          <label htmlFor="pos-notes" className="block text-xs font-bold text-ink-muted mb-1">Nota (opcional)</label>
          <input
            id="pos-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-moss/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-moss/30"
            placeholder="Ej. Entregar después de las 3 p. m."
          />
        </div>

        {error && (
          <p role="alert" className="p-3 rounded-xl border border-rose-300 bg-rose-50 text-sm text-rose-900">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
