import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/presentation/components/layout/Sidebar';
import { TopHeader } from '@/presentation/components/layout/TopHeader';

export const metadata: Metadata = {
  title: 'Gestor de Operaciones PS - ERP Pajarita Store',
  description: 'Sistema Integral de Gestión de Operaciones, Catálogo, Importaciones e Inventario para Pajarita Store.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="h-full overflow-hidden">
      <body className="erp-app h-full flex overflow-hidden text-ink antialiased selection:bg-mustard selection:text-moss-900">
        {/* Barra Lateral Modular Fija en Moss */}
        <Sidebar />

        {/* Área de Trabajo y Contenido Principal con Scroll Independiente */}
        <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
          <TopHeader />
          <main className="flex-1 overflow-y-auto p-6 md:p-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
