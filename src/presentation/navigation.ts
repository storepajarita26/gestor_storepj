import {
  LayoutDashboard,
  ScanBarcode,
  Receipt,
  CreditCard,
  Users,
  MessageSquareQuote,
  Warehouse,
  ShoppingBag,
  PackageSearch,
  Boxes,
  BarChart3,
  Settings,
} from 'lucide-react';

export interface NavItem {
  /** Nombre corto (menú y encabezado) */
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Una línea que explica la pantalla (debajo del título en el encabezado) */
  description: string;
  isPublic?: boolean;
  /** Atajo visible en el menú */
  shortcut?: string;
}

/** Menú ordenado por frecuencia de uso en la tienda */
export const NAV_ITEMS: NavItem[] = [
  { name: 'Inicio', href: '/dashboard', icon: LayoutDashboard, description: 'Resumen del día: ventas, cobros pendientes y existencias' },
  { name: 'Vender', href: '/vender', icon: ScanBarcode, description: 'Punto de venta: escanee o busque prendas y cobre', shortcut: 'Alt+V' },
  { name: 'Ventas', href: '/ventas', icon: Receipt, description: 'Facturas emitidas, entregas, anulaciones y devoluciones' },
  { name: 'Créditos', href: '/creditos', icon: CreditCard, description: 'Cuentas por cobrar, vencimientos y abonos' },
  { name: 'Clientes', href: '/clientes', icon: Users, description: 'Fichas de clientes, historial de compras y saldos' },
  { name: 'Consultas', href: '/consultas', icon: MessageSquareQuote, description: 'Cotizaciones y consultas de productos de Shein / Amazon' },
  { name: 'Inventario', href: '/inventario', icon: Warehouse, description: 'Existencias, kardex, ajustes y desempaque' },
  { name: 'Compras', href: '/compras', icon: ShoppingBag, description: 'Órdenes a Shein / Amazon, gastos de importación y prorrateo' },
  { name: 'Recepciones', href: '/recepciones', icon: PackageSearch, description: 'Llegada de lotes a Nicaragua y entrada a bodega' },
  { name: 'Catálogo', href: '/catalogo', icon: Boxes, description: 'Productos, variantes, precios y etiquetas', isPublic: true },
  { name: 'Analítica', href: '/analitica', icon: BarChart3, description: 'Márgenes, existencias y salud de los créditos' },
  { name: 'Configuración', href: '/configuracion', icon: Settings, description: 'Tienda, tasa de cambio, categorías y régimen fiscal' },
];

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}

/** Evento para abrir un registro concreto después de navegar (búsqueda global) */
export const DEEP_LINK_EVENT = 'ps:deeplink';

export interface DeepLink {
  /** Ruta de destino */
  href: string;
  /** Qué abrir en esa pantalla, p. ej. { factura: id } */
  params: Record<string, string>;
}
