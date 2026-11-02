import { Metadata } from 'next';
import { LoginView } from '@/presentation/modules/auth/LoginView';

export const metadata: Metadata = {
  title: 'Iniciar Sesión | Pajarita Store ERP',
  description: 'Acceso a la plataforma de administración y operaciones de Pajarita Store.',
};

export default function LoginPage() {
  return <LoginView />;
}
