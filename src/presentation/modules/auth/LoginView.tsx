'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/presentation/context/AuthContext';
import { Lock, Mail, KeyRound, AlertCircle, ArrowRight, Eye, EyeOff, ShieldCheck, ShoppingBag } from 'lucide-react';
import Link from 'next/link';

export function LoginView() {
  const router = useRouter();
  const { signInWithPassword, isConfigured } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Por favor completa todos los campos.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const { error } = await signInWithPassword(email.trim(), password);

    if (error) {
      setErrorMsg(error.message || 'Credenciales inválidas o error de conexión.');
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-[#200A1E] flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      {/* Glow ambiental de fondo */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-amber-500/15 to-purple-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Encabezado e identidad de marca */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#EAA824] to-[#F59E0B] text-[#260B22] shadow-xl shadow-amber-500/25 mb-4 border border-white/10 font-black text-2xl tracking-wider">
            PS
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Pajarita Store ERP</h1>
          <p className="text-sm text-amber-200/80 mt-1 font-medium">Gestor de Operaciones & Catálogo</p>
        </div>

        {/* Tarjeta de Login */}
        <div className="bg-[#2D122B]/90 backdrop-blur-xl border border-purple-800/40 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center justify-between pb-5 border-b border-purple-800/40 mb-6">
            <div>
              <h2 className="text-lg font-bold text-white">Iniciar Sesión</h2>
              <p className="text-xs text-purple-200/70">Acceso a módulos administrativos</p>
            </div>
            <Lock className="w-5 h-5 text-amber-400" />
          </div>

          {!isConfigured && (
            <div className="mb-5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Supabase aún no está conectado con variables en <code className="bg-amber-950/40 px-1 py-0.5 rounded text-amber-300 font-mono">.env.local</code>. Puedes revisar el catálogo público libremente.
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-purple-100 mb-1.5">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-purple-300/70 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@pajaritastore.com"
                  required
                  className="w-full bg-[#1C071A] border border-purple-900/60 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-purple-300/40 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-purple-100 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-purple-300/70 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-[#1C071A] border border-purple-900/60 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-purple-300/40 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-300/70 hover:text-white transition-colors p-0.5"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl font-black text-sm text-[#260B22] bg-gradient-to-r from-[#EAA824] to-[#F59E0B] hover:from-[#DE9C1D] hover:to-[#EA9200] active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#260B22] border-t-transparent rounded-full animate-spin" />
                  Verificando...
                </span>
              ) : (
                <>
                  <span>Ingresar al Sistema</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Separador de Consulta Pública */}
          <div className="mt-6 pt-5 border-t border-purple-800/40 text-center">
            <p className="text-xs text-purple-200/70 mb-3">¿Deseas solo consultar productos disponibles?</p>
            <Link
              href="/catalogo"
              className="inline-flex items-center justify-center gap-2 text-xs font-bold text-amber-300 hover:text-amber-200 hover:underline py-1.5 px-3 rounded-lg bg-amber-400/10 border border-amber-400/20 transition-all"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Ver Catálogo e Inventario Público</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
