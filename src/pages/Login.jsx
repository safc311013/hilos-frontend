import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError('');
      await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen min-h-[100dvh] overflow-hidden bg-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.22),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.18),_transparent_30%)]" />
      <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl sm:h-80 sm:w-80" />
      <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl sm:h-96 sm:w-96" />
      <div className="absolute left-0 top-1/3 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl sm:h-72 sm:w-72" />

      <div className="relative z-10 flex min-h-screen min-h-[100dvh] items-center justify-center px-4 py-6 sm:px-6 sm:py-8">
        <div className="w-full max-w-md">
          <div className="rounded-[28px] border border-white/10 bg-white/10 p-1 shadow-2xl backdrop-blur-2xl sm:rounded-[32px]">
            <div className="rounded-[24px] border border-white/10 bg-slate-950/80 px-5 py-6 text-white sm:rounded-[28px] sm:px-8 sm:py-8">
              <div className="mb-6 text-center">
                <div className="mx-auto mb-3 flex items-center justify-center">
                  <img
                    src="/logo.png"
                    alt="Logo Hilos"
                    className="h-32 w-32 object-contain sm:h-[180px] sm:w-[180px] md:h-[200px] md:w-[200px]"
                  />
                </div>

                <span className="inline-flex rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-200">
                  Acceso seguro
                </span>

                <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                  Bienvenido a Hilos
                </h1>

                <p className="mt-1 text-sm leading-relaxed text-slate-300">
                  Inicia sesión para acceder a tu panel de gestión
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-200">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="Ingresa tu correo"
                    autoComplete="email"
                    inputMode="email"
                    required
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white/10 focus:ring-4 focus:ring-indigo-500/20"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-200">
                    Contraseña
                  </label>

                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={form.password}
                      onChange={handleChange}
                      placeholder="Ingresa tu contraseña"
                      autoComplete="current-password"
                      required
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 pr-24 text-base text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white/10 focus:ring-4 focus:ring-indigo-500/20"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-medium text-indigo-300 transition hover:bg-white/10 hover:text-white"
                    >
                      {showPassword ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>

                {error ? (
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.01] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? 'Ingresando...' : 'Entrar al sistema'}
                </button>
              </form>

              <div className="mt-5 text-center">
                <p className="text-xs leading-relaxed text-slate-400">
                  Plataforma interna para usuarios autorizados
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}