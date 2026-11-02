'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, CloudOff, Cloud, AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { dataStore, SyncOp, SyncState } from '@/infrastructure/repositories/dataStore';
import { Modal } from '@/presentation/components/ui/Modal';

/** Texto y color del estado de sincronización (reemplaza el antiguo "Sistema Operativo" fijo) */
function describe(state: SyncState): { label: string; detail: string; tone: 'ok' | 'warn' | 'error' | 'muted' } {
  if (!state.configured) return { label: 'Solo este equipo', detail: 'Sin base de datos en la nube configurada', tone: 'muted' };
  if (state.failed > 0) {
    return { label: `${state.failed} cambio(s) rechazado(s)`, detail: 'Revise y reintente o descarte', tone: 'error' };
  }
  if (!state.online) {
    return {
      label: 'Sin conexión',
      detail: state.pending > 0 ? `${state.pending} cambio(s) guardado(s) en este equipo` : 'Trabajando en este equipo',
      tone: 'warn',
    };
  }
  if (state.syncing) return { label: 'Sincronizando…', detail: `${state.pending} pendiente(s)`, tone: 'warn' };
  if (state.pending > 0) {
    return {
      label: `${state.pending} cambio(s) sin subir`,
      detail: state.authenticated ? (state.lastError || 'Reintentando') : 'Inicie sesión para sincronizar',
      tone: 'warn',
    };
  }
  return {
    label: 'Sincronizado',
    detail: state.lastSyncAt ? `Último envío ${new Date(state.lastSyncAt).toLocaleTimeString('es-NI')}` : 'Al día con la nube',
    tone: 'ok',
  };
}

const TONE_DOT: Record<string, string> = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  error: 'bg-rose-500',
  muted: 'bg-slate-400',
};

export function SyncStatus({ compact = false }: { compact?: boolean }) {
  // Se lee después de montar (en el servidor no hay LocalStorage ni estado de conexión)
  const [state, setState] = useState<SyncState>({
    configured: false, online: true, authenticated: false, syncing: true, pending: 0, failed: 0,
  });
  const [mounted, setMounted] = useState(false);
  const [ops, setOps] = useState<SyncOp[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setState(dataStore.getSyncState());
      setOps(dataStore.getSyncOps());
    };
    refresh();
    setMounted(true);
    return dataStore.subscribe(refresh);
  }, []);

  const info = mounted ? describe(state) : { label: 'Cargando…', detail: '', tone: 'muted' as const };

  const handleSyncNow = async () => {
    setBusy(true);
    await dataStore.syncNow();
    setBusy(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full flex items-center gap-2 text-left rounded-lg hover:bg-white/10 transition-colors ${compact ? 'justify-center p-1' : 'p-1.5'}`}
        title={`${info.label} · ${info.detail}`}
        aria-label={`Estado de sincronización: ${info.label}`}
      >
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${TONE_DOT[info.tone]} ${state.syncing ? 'animate-pulse' : ''}`} />
        {!compact && (
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-white truncate">{info.label}</span>
            <span className="block text-[11px] text-white/70 truncate">{info.detail}</span>
          </span>
        )}
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Sincronización con la nube"
        subtitle={`${info.label} · ${info.detail}`}
        maxWidth="xl"
      >
        <div className="space-y-4 text-sm">
          {state.configured ? (
            <p className="text-ink-muted">
              Cada cambio se guarda primero en este equipo y se sube a la nube en orden. Si no hay internet, se
              sube solo al recuperar la conexión. Si la nube rechaza un cambio (por ejemplo, otra caja vendió la
              última unidad), aparece aquí para reintentarlo o descartarlo. Al descartar, este equipo se
              actualiza con los datos de la nube.
            </p>
          ) : (
            <p className="text-ink-muted">
              Esta instalación no tiene Supabase configurado: los datos viven solo en este navegador.
            </p>
          )}

          {ops.length === 0 ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
              <Cloud className="w-4 h-4" aria-hidden="true" />
              No hay cambios pendientes.
            </div>
          ) : (
            <ul className="divide-y divide-moss/10 border border-moss/15 rounded-xl">
              {ops.map((op) => (
                <li key={op.id} className="p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink flex items-center gap-1.5">
                      {op.status === 'failed' ? (
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />
                      ) : (
                        <CloudOff className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                      )}
                      <span className="truncate">{op.label}</span>
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {new Date(op.createdAt).toLocaleString('es-NI')} · {op.status === 'failed' ? 'Rechazado' : 'Pendiente'}
                      {op.attempts > 0 ? ` · ${op.attempts} intento(s)` : ''}
                    </p>
                    {op.lastError && (
                      <p className={`text-xs mt-1 ${op.status === 'failed' ? 'text-rose-700' : 'text-amber-700'}`}>
                        {op.lastError}
                      </p>
                    )}
                  </div>
                  {op.status === 'failed' && (
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => dataStore.retrySyncOp(op.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-moss bg-moss/10 hover:bg-moss/20"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Reintentar
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm(`¿Descartar "${op.label}"? Este cambio no llegará a la nube y este equipo se actualizará con los datos de la nube.`)) {
                            await dataStore.discardSyncOp(op.id);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Descartar
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {state.configured && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-white bg-moss hover:bg-moss-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
                {busy ? 'Sincronizando…' : 'Sincronizar ahora'}
              </button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
