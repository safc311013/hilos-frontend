import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Header({ title }) {
  const { usuario, logout } = useAuth();

  return (
    <header className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-2xl font-bold text-gray-800 sm:text-3xl">{title}</h2>
        <p className="mt-1 text-sm text-gray-500 sm:text-base">
          Bienvenido, {usuario?.nombre}
        </p>
      </div>

      <button
        type="button"
        onClick={logout}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 sm:w-auto sm:px-5"
      >
        <LogOut size={18} />
        Cerrar sesión
      </button>
    </header>
  );
}