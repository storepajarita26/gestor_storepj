import { CloudError, classifyError } from '../supabase/cloudWriter';

/**
 * COLA DE SINCRONIZACIÓN (OUTBOX)
 *
 * Cada cambio que debe llegar a Supabase se guarda primero aquí (y en LocalStorage),
 * y se envía en orden. Así:
 *   - si no hay internet, nada se pierde: se reintenta solo al volver la conexión;
 *   - si la base rechaza un cambio (p. ej. ya no hay existencia porque otra caja vendió
 *     la prenda), queda marcado como "rechazado" y se muestra al usuario para que lo
 *     reintente o lo descarte, en lugar de perderse en la consola;
 *   - la interfaz puede mostrar cuántos cambios faltan por subir.
 *
 * La cola no sabe nada del negocio: recibe un "ejecutor" (qué llamada hacer en la nube)
 * y los "manejadores" que aplican la respuesta de la nube a los datos locales.
 */

export type SyncOpStatus = 'pending' | 'failed';

export interface SyncOp {
  id: string;
  /** Nombre del ejecutor, p. ej. 'rpc:erp_registrar_venta' o 'upsertProduct' */
  action: string;
  /** Argumentos serializables del ejecutor */
  payload: unknown;
  /** Descripción para el usuario, p. ej. "Venta a Ana López (C$ 1,200.00)" */
  label: string;
  createdAt: string;
  attempts: number;
  status: SyncOpStatus;
  lastError?: string;
  /** Contexto para el manejador del resultado (ids locales, etc.) */
  meta?: Record<string, unknown>;
}

export interface SyncState {
  configured: boolean;
  online: boolean;
  authenticated: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  lastSyncAt?: string;
  lastError?: string;
}

export type SyncOutcome =
  | { status: 'synced'; result: unknown }
  | { status: 'failed'; error: string }
  | { status: 'pending'; error?: string };

type Executor = (payload: any) => Promise<unknown>;
type SuccessHandler = (result: any, op: SyncOp) => void;
type FailureHandler = (error: CloudError, op: SyncOp) => void;

const STORAGE_KEY = 'ps_outbox';
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class SyncQueue {
  private ops: SyncOp[] = [];
  private executors = new Map<string, Executor>();
  private successHandlers = new Map<string, SuccessHandler>();
  private failureHandlers = new Map<string, FailureHandler>();
  private listeners = new Set<() => void>();
  private waiters = new Map<string, ((o: SyncOutcome) => void)[]>();
  private processing: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private state: SyncState;

  constructor(
    private options: {
      configured: boolean;
      isAuthenticated: () => Promise<boolean>;
      storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
    }
  ) {
    this.state = {
      configured: options.configured,
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
      authenticated: false,
      syncing: false,
      pending: 0,
      failed: 0,
    };
    this.load();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.setState({ online: true });
        this.process();
      });
      window.addEventListener('offline', () => this.setState({ online: false }));
      // Respaldo: reintentar periódicamente lo pendiente
      setInterval(() => {
        if (this.pendingCount() > 0) this.process();
      }, 60_000);
    }
  }

  // ---------------------------------------------------------------- registro
  register(action: string, executor: Executor, onSuccess?: SuccessHandler, onFailure?: FailureHandler) {
    this.executors.set(action, executor);
    if (onSuccess) this.successHandlers.set(action, onSuccess);
    if (onFailure) this.failureHandlers.set(action, onFailure);
  }

  // ---------------------------------------------------------------- consulta
  getState(): SyncState {
    return { ...this.state };
  }

  getOps(): SyncOp[] {
    return this.ops.map((o) => ({ ...o }));
  }

  hasOp(id: string): boolean {
    return this.ops.some((o) => o.id === id);
  }

  isEmpty(): boolean {
    return this.ops.length === 0;
  }

  pendingCount(): number {
    return this.ops.filter((o) => o.status === 'pending').length;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------------------------------------------------------------- operaciones
  /** Agrega un cambio a la cola y comienza a enviarlo. Devuelve el id de la operación. */
  enqueue(action: string, payload: unknown, label: string, meta?: Record<string, unknown>): string {
    const op: SyncOp = {
      id: newId(),
      action,
      payload,
      label,
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: 'pending',
      meta,
    };
    this.ops.push(op);
    this.save();
    this.process();
    return op.id;
  }

  /** Espera el resultado de una operación hasta timeoutMs (luego sigue en segundo plano). */
  waitFor(opId: string, timeoutMs: number = 8_000): Promise<SyncOutcome> {
    const op = this.ops.find((o) => o.id === opId);
    if (!op) return Promise.resolve({ status: 'synced', result: undefined });
    if (op.status === 'failed') return Promise.resolve({ status: 'failed', error: op.lastError || 'Rechazado' });

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const list = this.waiters.get(opId) || [];
        this.waiters.set(opId, list.filter((fn) => fn !== done));
        const current = this.ops.find((o) => o.id === opId);
        resolve({ status: 'pending', error: current?.lastError });
      }, timeoutMs);
      const done = (outcome: SyncOutcome) => {
        clearTimeout(timer);
        resolve(outcome);
      };
      this.waiters.set(opId, [...(this.waiters.get(opId) || []), done]);
    });
  }

  /** Vuelve a intentar un cambio rechazado. */
  retry(opId: string) {
    const op = this.ops.find((o) => o.id === opId);
    if (!op) return;
    op.status = 'pending';
    op.lastError = undefined;
    this.save();
    this.process();
  }

  /**
   * Vuelve a poner en "pendiente" TODOS los cambios rechazados (en su orden original) y
   * los envía. Sirve cuando un cambio depende de otro que también fue rechazado
   * (p. ej. la venta de un cliente nuevo cuyo registro no subió).
   */
  retryFailed() {
    let changed = false;
    this.ops.forEach((op) => {
      if (op.status === 'failed') {
        op.status = 'pending';
        op.lastError = undefined;
        changed = true;
      }
    });
    if (changed) this.save();
    return this.process();
  }

  /** Descarta un cambio (no se enviará a la nube). */
  discard(opId: string) {
    this.ops = this.ops.filter((o) => o.id !== opId);
    this.save();
    this.resolveWaiters(opId, { status: 'failed', error: 'Descartado' });
  }

  /** Envía los cambios pendientes, en orden. Si ya se está enviando, espera esa misma ronda. */
  process(): Promise<void> {
    if (!this.options.configured) return Promise.resolve();
    if (this.processing) return this.processing;
    this.processing = this.runLoop().finally(() => {
      this.processing = null;
    });
    return this.processing;
  }

  // ---------------------------------------------------------------- internos
  private async runLoop() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setState({ online: false });
      return;
    }
    const authenticated = await this.options.isAuthenticated();
    this.setState({ authenticated });
    if (!authenticated) return; // sin sesión las políticas RLS rechazarían todo: esperar

    this.setState({ syncing: true });
    try {
      // Se recorre en orden; los cambios agregados mientras se envía también entran en esta ronda
      const tried = new Set<string>();
      for (;;) {
        const op = this.ops.find((o) => o.status === 'pending' && !tried.has(o.id));
        if (!op) break;
        tried.add(op.id);
        const executor = this.executors.get(op.action);
        if (!executor) {
          this.markFailed(op, new CloudError('business', `Acción desconocida: ${op.action}`));
          continue;
        }

        op.attempts += 1;
        try {
          const result = await executor(op.payload);
          this.ops = this.ops.filter((o) => o !== op);
          this.save();
          try {
            this.successHandlers.get(op.action)?.(result, op);
          } catch (handlerErr) {
            console.warn('Error aplicando la respuesta de la nube:', handlerErr);
          }
          this.setState({ lastSyncAt: new Date().toISOString(), lastError: undefined, online: true });
          this.resolveWaiters(op.id, { status: 'synced', result });
        } catch (raw) {
          const err = classifyError(raw);
          if (err.kind === 'business') {
            // Rechazo real: se aparta para revisión y se sigue con lo demás
            this.markFailed(op, err);
            continue;
          }
          // Red o sesión: se detiene la ronda (para no alterar el orden) y se reintenta después
          op.lastError = err.message;
          this.save();
          this.setState({ lastError: err.message, online: err.kind !== 'network' ? this.state.online : false });
          this.notifyWaitersPending(op);
          this.scheduleRetry(op.attempts);
          break;
        }
      }
    } finally {
      this.setState({ syncing: false });
    }
  }

  private markFailed(op: SyncOp, err: CloudError) {
    op.status = 'failed';
    op.lastError = err.message;
    this.save();
    try {
      this.failureHandlers.get(op.action)?.(err, op);
    } catch (handlerErr) {
      console.warn('Error procesando el rechazo de la nube:', handlerErr);
    }
    this.resolveWaiters(op.id, { status: 'failed', error: err.message });
  }

  private notifyWaitersPending(op: SyncOp) {
    // Los que esperan reciben "pendiente" sin aguardar todo el timeout (no hay conexión)
    this.resolveWaiters(op.id, { status: 'pending', error: op.lastError });
  }

  private resolveWaiters(opId: string, outcome: SyncOutcome) {
    const list = this.waiters.get(opId) || [];
    this.waiters.delete(opId);
    list.forEach((fn) => fn(outcome));
  }

  private scheduleRetry(attempts: number) {
    if (this.retryTimer) return;
    const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.process();
    }, delay);
  }

  private setState(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit() {
    this.state = {
      ...this.state,
      pending: this.ops.filter((o) => o.status === 'pending').length,
      failed: this.ops.filter((o) => o.status === 'failed').length,
    };
    this.listeners.forEach((fn) => fn());
  }

  private storage() {
    if (this.options.storage !== undefined) return this.options.storage;
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      return null;
    }
  }

  private load() {
    try {
      const raw = this.storage()?.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      this.ops = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.ops = [];
    }
    this.emit();
  }

  private save() {
    try {
      this.storage()?.setItem(STORAGE_KEY, JSON.stringify(this.ops));
    } catch (e) {
      console.warn('No se pudo guardar la cola de sincronización:', e);
    }
    this.emit();
  }
}
