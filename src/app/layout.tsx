import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/presentation/components/layout/AppShell';
import { AuthProvider } from '@/presentation/context/AuthContext';

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
    <html lang="es" className="h-full">
      <body className="h-full overflow-hidden">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
