'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, ShieldCheck } from 'lucide-react';
import { dataStore } from '@/infrastructure/repositories/dataStore';

interface TopHeaderProps {
  title?: string;
  subtitle?: string;
}

export function TopHeader({ title, subtitle }: TopHeaderProps) {
  const [exchangeRate, setExchangeRate] = useState<number>(36.80);
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [tempRate, setTempRate] = useState('36.80');

  useEffect(() => {
    setExchangeRate(dataStore.getExchangeRate());
    setTempRate(dataStore.getExchangeRate().toString());
    const unsub = dataStore.subscribe(() => {
      const r = dataStore.getExchangeRate();
      setExchangeRate(r);
      setTempRate(r.toString());
    });
    return unsub;
  }, []);

  const handleSaveRate = () => {
    const parsed = parseFloat(tempRate);
    if (!isNaN(parsed) && parsed > 0) {
      dataStore.setExchangeRate(parsed);
      setIsEditingRate(false);
    }
  };

  return (
    <header className="h-16 border-b border-moss/10 bg-white/70 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
      {/* Title / Module info */}
      <div>
        <h2 className="text-base font-bold text-ink tracking-tight">
          {title || 'Gestor de Operaciones'}
        </h2>
        {subtitle && <p className="text-xs text-ink-muted">{subtitle}</p>}
      </div>

      {/* Action and Tools bar */}
      <div className="flex items-center gap-4">
        {/* Exchange Rate Badge */}
        <div className="flex items-center gap-2 bg-surface border border-moss/15 px-3 py-1.5 rounded-xl text-xs shadow-sm">
          <DollarSign className="w-3.5 h-3.5 text-moss" />
          <span className="text-ink-muted font-medium">Tasa USD/NIO:</span>
          {isEditingRate ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.01"
                value={tempRate}
                onChange={(e) => setTempRate(e.target.value)}
                className="w-16 bg-white border border-moss rounded px-1.5 py-0.5 text-xs text-ink focus:outline-none"
                autoFocus
              />
              <button
                onClick={handleSaveRate}
                className="bg-moss hover:bg-moss-700 text-white text-[10px] px-2 py-0.5 rounded font-semibold transition-colors"
              >
                OK
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingRate(true)}
              className="font-bold text-moss hover:underline flex items-center gap-1"
              title="Click para cambiar tasa oficial"
            >
              C$ {exchangeRate.toFixed(2)}
              <span className="text-[10px] text-ink-muted font-normal">(editar)</span>
            </button>
          )}
        </div>

        {/* Security badge */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-ink-muted bg-surface/80 px-2.5 py-1.5 rounded-xl border border-moss/10">
          <ShieldCheck className="w-3.5 h-3.5 text-moss" />
          <span>Sesión Operativa</span>
        </div>
      </div>
    </header>
  );
}
