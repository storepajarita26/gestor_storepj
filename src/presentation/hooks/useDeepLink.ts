'use client';

import { useEffect, useRef } from 'react';
import { DEEP_LINK_EVENT } from '@/presentation/navigation';

/**
 * Abre un registro concreto al llegar a la pantalla, p. ej. /ventas?factura=<id>.
 * Funciona al entrar con la URL y cuando la búsqueda global navega estando ya en la pantalla.
 * Después de usarlo, quita el parámetro de la URL (para que recargar no lo vuelva a abrir).
 */
export function useDeepLink(param: string, onValue: (value: string) => void, ready: boolean = true) {
  const handler = useRef(onValue);
  handler.current = onValue;

  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;

    const consume = () => {
      const url = new URL(window.location.href);
      const value = url.searchParams.get(param);
      if (!value) return;
      handler.current(value);
      url.searchParams.delete(param);
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    };

    consume();
    const onEvent = () => consume();
    window.addEventListener(DEEP_LINK_EVENT, onEvent);
    return () => window.removeEventListener(DEEP_LINK_EVENT, onEvent);
  }, [param, ready]);
}
