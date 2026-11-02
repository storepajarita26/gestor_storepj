import React from 'react';

export type BadgeVariant =
  | 'comprado'
  | 'en_agencia_envio'
  | 'en_transito_nicaragua'
  | 'recibido_parcial'
  | 'recibido_completo'
  | 'recibido'
  | 'pendiente'
  | 'no_vino'
  | 'devuelto'
  | 'cancelado'
  | 'parcial'
  | 'pagada'
  | 'borrador'
  | 'anulada'
  | 'simple'
  | 'especial'
  | 'regalia'
  | 'paquete';

const BADGE_CONFIG: Record<string, { label: string; style: string }> = {
  // Compras y Tránsito
  comprado: { label: 'Comprado', style: 'bg-moss/10 text-moss-800 border-moss/25' },
  en_agencia_envio: { label: 'En Casillero USA', style: 'bg-sky-500/10 text-sky-800 border-sky-500/20' },
  en_transito_nicaragua: { label: 'En Tránsito MGA', style: 'bg-mustard/40 text-moss-950 border-mustard/60 font-semibold' },
  recibido_parcial: { label: 'Recepción Parcial', style: 'bg-purple-500/10 text-purple-800 border-purple-500/20' },
  recibido_completo: { label: 'Recibido en Bodega', style: 'bg-emerald-600/10 text-emerald-800 border-emerald-600/25' },
  
  // Recepción de Items
  recibido: { label: 'Recibido OK', style: 'bg-emerald-600/10 text-emerald-800 border-emerald-600/25' },
  pendiente: { label: 'Pendiente', style: 'bg-eggshell text-ink-muted border-moss/15' },
  no_vino: { label: 'No Vino (Faltante)', style: 'bg-rose-500/10 text-rose-800 border-rose-500/20' },
  devuelto: { label: 'Devuelto', style: 'bg-orange-500/10 text-orange-800 border-orange-500/20' },
  cancelado: { label: 'Cancelado', style: 'bg-rose-500/10 text-rose-800 border-rose-500/20' },

  // Facturas y Cobros
  parcial: { label: 'Abono Parcial', style: 'bg-amber-500/10 text-amber-900 border-amber-500/30 font-semibold' },
  pagada: { label: 'Cancelada / Pagada', style: 'bg-emerald-600/10 text-emerald-800 border-emerald-600/25 font-semibold' },
  borrador: { label: 'Borrador', style: 'bg-eggshell text-ink-muted border-moss/15' },
  anulada: { label: 'Anulada', style: 'bg-slate-200 text-slate-600 border-slate-300' },

  // Estados de Entrega / Cumplimiento de Ventas
  en_transito: { label: '✈️ En Tránsito', style: 'bg-sky-500/10 text-sky-800 border-sky-500/25 font-semibold' },
  listo_entrega: { label: '📦 Listo p/ Entrega', style: 'bg-amber-500/10 text-amber-900 border-amber-500/30 font-semibold' },
  entregado: { label: '✓ Entregado', style: 'bg-emerald-600/10 text-emerald-800 border-emerald-600/25 font-semibold' },

  // Modalidades y Tipos
  simple: { label: 'Stock Tienda', style: 'bg-moss/10 text-moss-800 border-moss/20' },
  especial: { label: 'Bajo Pedido (25%)', style: 'bg-purple-500/10 text-purple-800 border-purple-500/20' },
  regalia: { label: 'Regalía / Promo', style: 'bg-pink-500/10 text-pink-800 border-pink-500/20' },
  paquete: { label: 'Pack / Desempacar', style: 'bg-mustard/30 text-moss-950 border-mustard/50' },
};

export function StatusBadge({ status }: { status: string }) {
  const config = BADGE_CONFIG[status] || {
    label: status,
    style: 'bg-eggshell text-ink-muted border-moss/15',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${config.style}`}
    >
      {config.label}
    </span>
  );
}
