import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, cambiarPassword, usuario, avisoSesion, limpiarAvisoSesion } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({
    email: '',
    password: '',
  });
  const [cambioForm, setCambioForm] = useState({
    passwordActual: '',
    nuevaPassword: '',
    confirmarPassword: '',
  });
  const [passwordTemporal, setPasswordTemporal] = useState('');
  const [modoCambioPassword, setModoCambioPassword] = useState(
    Boolean(location.state?.requiereCambioPassword || usuario?.debeCambiarPassword)
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNuevaPassword, setShowNuevaPassword] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleCambioChange = (e) => {
    setCambioForm({ ...cambioForm, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError('');
      const resultado = await login(form.email, form.password);

      if (resultado?.debeCambiarPassword) {
        setPasswordTemporal(form.password);
        setModoCambioPassword(true);
        setCambioForm({
          passwordActual: '',
          nuevaPassword: '',
          confirmarPassword: '',
        });
        return;
      }

      navigate('/');
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleCambiarPassword = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError('');

      await cambiarPassword({
        passwordActual:
          passwordTemporal || form.password || cambioForm.passwordActual,
        nuevaPassword: cambioForm.nuevaPassword,
        confirmarPassword: cambioForm.confirmarPassword,
      });

      setModoCambioPassword(false);
      setPasswordTemporal('');
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo cambiar la contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen h-[100dvh] overflow-hidden bg-gray-100">
      <div className="flex h-full items-center justify-center px-4 py-4 sm:px-6">
        <div className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
          <main className="px-5 py-6 sm:px-10 sm:py-8">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-7 text-center sm:mb-8">
                <div className="mx-auto mb-8 flex items-center justify-center">
                  <img
                    src="/logo.png"
                    alt="Logo Hilos"
                    className="h-44 w-44 object-contain sm:h-56 sm:w-56"
                  />
                </div>

                <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                  Bienvenido a Hilos
                </h1>

                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  Inicia sesión para acceder a tu panel de gestión
                </p>
              </div>

              {!modoCambioPassword ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {avisoSesion ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
                      <div className="flex items-start justify-between gap-3">
                        <p>{avisoSesion}</p>
                        <button
                          type="button"
                          onClick={limpiarAvisoSesion}
                          className="shrink-0 font-semibold text-amber-700 transition hover:text-amber-900"
                          aria-label="Cerrar aviso"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
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
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
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
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-12 text-base text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {error ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <LogIn size={18} />
                    {loading ? 'Ingresando...' : 'Entrar al sistema'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleCambiarPassword} className="space-y-4">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Es tu primer acceso o tu usuario fue restablecido. Define una nueva contraseña para continuar.
                  </div>

                  {!passwordTemporal && !form.password ? (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        Contraseña temporal
                      </label>
                      <input
                        type="password"
                        name="passwordActual"
                        value={cambioForm.passwordActual}
                        onChange={handleCambioChange}
                        placeholder="Ingresa la contraseña temporal"
                        autoComplete="current-password"
                        required
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                      />
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      Nueva contraseña
                    </label>

                    <div className="relative">
                      <input
                        type={showNuevaPassword ? 'text' : 'password'}
                        name="nuevaPassword"
                        value={cambioForm.nuevaPassword}
                        onChange={handleCambioChange}
                        placeholder="Mínimo 6 caracteres"
                        autoComplete="new-password"
                        required
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-12 text-base text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                      />

                      <button
                        type="button"
                        onClick={() => setShowNuevaPassword(!showNuevaPassword)}
                        className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                        aria-label={showNuevaPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showNuevaPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      Confirmar contraseña
                    </label>
                    <input
                      type={showNuevaPassword ? 'text' : 'password'}
                      name="confirmarPassword"
                      value={cambioForm.confirmarPassword}
                      onChange={handleCambioChange}
                      placeholder="Repite la nueva contraseña"
                      autoComplete="new-password"
                      required
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                    />
                  </div>

                  {error ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <KeyRound size={18} />
                    {loading ? 'Actualizando...' : 'Guardar nueva contraseña'}
                  </button>
                </form>
              )}

            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
