export default function Loader({ fullScreen = false, texto = 'Cargando...' }) {
  const wrapperClass = fullScreen
    ? 'flex min-h-screen min-h-[100dvh] items-center justify-center bg-gray-100 px-4'
    : 'flex items-center justify-center py-10';

  return (
    <div className={wrapperClass}>
      <div className="flex flex-col items-center justify-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600 sm:h-11 sm:w-11" />
        <p className="text-sm font-medium text-gray-500">{texto}</p>
      </div>
    </div>
  );
}