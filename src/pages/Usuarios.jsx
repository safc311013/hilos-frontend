import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import { api } from '../config/api';
import { useRealtime } from '../context/RealtimeContext';
import usePermisos from '../hooks/usePermisos';
import { PERMISOS } from '../utils/permisos';

const initialForm = {
  nombre: '',
  email: '',
  password: '',
  rol: 'cajero',
  activo: true,
};

export default function Usuarios() {
  const { usuario, puede } = usePermisos();
  const { lastEvent } = useRealtime();

  const [usuarios, setUsuarios] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editandoId, setEditandoId] = useState(null);
  const [errorAccion, setErrorAccion] = useState('');
  const [modalFormulario, setModalFormulario] = useState(false);
  const [modalEliminar, setModalEliminar] = useState({
    abierto: false,
    usuario: null,
  });
  const [modalRestablecer, setModalRestablecer] = useState({
    abierto: false,
    usuario: null,
  });
  const [passwordTemporalReset, setPasswordTemporalReset] = useState('');

  const cargarUsuarios = async () => {
    const { data } = await api.get('/usuarios');
    setUsuarios(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    if (!puede(PERMISOS.GESTIONAR_USUARIOS)) return;

    const init = async () => {
      try {
        setErrorAccion('');
        await cargarUsuarios();
      } catch (error) {
        setErrorAccion(
          error.response?.data?.mensaje || 'No se pudo cargar la lista de usuarios'
        );
      }
    };

    init();
  }, [usuario]);

  useEffect(() => {
    if (!puede(PERMISOS.GESTIONAR_USUARIOS)) return;
    if (lastEvent?.tipo !== 'usuarios') return;

    const refrescar = async () => {
      try {
        setErrorAccion('');
        await cargarUsuarios();
      } catch (error) {
        console.error('No se pudo actualizar la lista de usuarios en tiempo real', error);
      }
    };

    refrescar();
  }, [lastEvent, usuario]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (modalRestablecer.abierto) cerrarModalRestablecer();
        if (modalEliminar.abierto) cerrarModalEliminar();
        if (modalFormulario) cerrarModalFormulario();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalEliminar.abierto, modalRestablecer.abierto, modalFormulario]);

  useEffect(() => {
    if (modalEliminar.abierto || modalRestablecer.abierto || modalFormulario) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [modalEliminar.abierto, modalRestablecer.abierto, modalFormulario]);

  if (!puede(PERMISOS.GESTIONAR_USUARIOS)) {
    return (
      <Layout>
        <Header title="Usuarios" />
        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-5 text-amber-800 shadow-sm">
          <p className="text-lg font-semibold">Acceso restringido</p>
          <p className="mt-1 text-sm text-amber-700">
            No tienes permiso para gestionar usuarios.
          </p>
        </div>
      </Layout>
    );
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditandoId(null);
  };

  const abrirModalFormularioNuevo = () => {
    setErrorAccion('');
    resetForm();
    setModalFormulario(true);
  };

  const abrirModalFormularioEditar = (item) => {
    setErrorAccion('');
    setEditandoId(item._id);
    setForm({
      nombre: item.nombre,
      email: item.email,
      password: '',
      rol: item.rol,
      activo: item.activo,
    });
    setModalFormulario(true);
  };

  const cerrarModalFormulario = () => {
    setModalFormulario(false);
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorAccion('');

    try {
      if (editandoId) {
        await api.put(`/usuarios/${editandoId}`, {
          nombre: form.nombre,
          email: form.email,
          rol: form.rol,
          activo: form.activo,
        });
      } else {
        await api.post('/usuarios', form);
      }

      resetForm();
      setModalFormulario(false);
      await cargarUsuarios();
    } catch (error) {
      setErrorAccion(
        error.response?.data?.mensaje || 'No se pudo guardar el usuario'
      );
    }
  };

  const editar = (item) => {
    setErrorAccion('');
    setEditandoId(item._id);
    setForm({
      nombre: item.nombre,
      email: item.email,
      password: '',
      rol: item.rol,
      activo: item.activo,
    });
  };

  const abrirModalEliminar = (item) => {
    setErrorAccion('');
    setModalEliminar({
      abierto: true,
      usuario: item,
    });
  };

  const cerrarModalEliminar = () => {
    setModalEliminar({
      abierto: false,
      usuario: null,
    });
  };

  const abrirModalRestablecer = (item) => {
    setErrorAccion('');
    setPasswordTemporalReset('');
    setModalRestablecer({
      abierto: true,
      usuario: item,
    });
  };

  const cerrarModalRestablecer = () => {
    setModalRestablecer({
      abierto: false,
      usuario: null,
    });
    setPasswordTemporalReset('');
  };

  const confirmarRestablecer = async () => {
    if (!modalRestablecer.usuario?._id) return;

    try {
      setErrorAccion('');
      await api.post(`/usuarios/${modalRestablecer.usuario._id}/restablecer`, {
        password: passwordTemporalReset,
      });
      cerrarModalRestablecer();
      await cargarUsuarios();
    } catch (error) {
      setErrorAccion(
        error.response?.data?.mensaje || 'No se pudo restablecer el usuario'
      );
    }
  };

  const confirmarEliminacion = async () => {
    if (!modalEliminar.usuario?._id) return;

    try {
      setErrorAccion('');
      await api.delete(`/usuarios/${modalEliminar.usuario._id}`);
      cerrarModalEliminar();
      await cargarUsuarios();
    } catch (error) {
      setErrorAccion(
        error.response?.data?.mensaje || 'No se pudo eliminar el usuario'
      );
    }
  };

  const getRolTexto = (rol) => {
    if (rol === 'admin') return 'Administrador';
    if (rol === 'supervisor') return 'Supervisor';
    if (rol === 'cajero') return 'Cajero';
    return rol;
  };

  const getRolClase = (rol) => {
    if (rol === 'admin') {
      return 'bg-violet-100 text-violet-700 border border-violet-200';
    }
    if (rol === 'supervisor') {
      return 'bg-sky-100 text-sky-700 border border-sky-200';
    }
    return 'bg-amber-100 text-amber-700 border border-amber-200';
  };

  const FormularioUsuario = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Nombre completo
        </label>
        <input
          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
          name="nombre"
          placeholder="Ej. Juan Pérez"
          value={form.nombre}
          onChange={handleChange}
          required
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Correo electrónico
        </label>
        <input
          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
          name="email"
          type="email"
          placeholder="usuario@correo.com"
          value={form.email}
          onChange={handleChange}
          required
        />
      </div>

      {!editandoId ? (
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Contraseña
          </label>
          <input
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
            name="password"
            type="password"
            placeholder="Escribe una contraseña"
            value={form.password}
            onChange={handleChange}
            required
          />
          <p className="mt-1 text-xs text-gray-500">
            Esta es una contraseña temporal. El usuario deberá cambiarla en su primer inicio de sesión.
          </p>
        </div>
      ) : null}

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Rol del usuario
        </label>
        <select
          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
          name="rol"
          value={form.rol}
          onChange={handleChange}
        >
          <option value="admin">Administrador</option>
          <option value="supervisor">Supervisor</option>
          <option value="cajero">Cajero</option>
        </select>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <label className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-800">Usuario activo</p>
            <p className="mt-1 text-xs text-gray-500">
              Permite el acceso del usuario al sistema.
            </p>
          </div>
          <input
            type="checkbox"
            name="activo"
            checked={form.activo}
            onChange={handleChange}
            className="h-5 w-5 rounded border-gray-300 text-slate-900 focus:ring-slate-400"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
        <button
          className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95"
          type="submit"
        >
          {editandoId ? 'Guardar cambios' : 'Crear usuario'}
        </button>

        <button
          className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          type="button"
          onClick={() => {
            resetForm();
            if (modalFormulario) {
              setModalFormulario(false);
            }
          }}
        >
          {modalFormulario ? 'Cancelar' : 'Limpiar'}
        </button>
      </div>
    </form>
  );

  return (
    <Layout>
      <Header title="Usuarios" />

      <div className="space-y-5 sm:space-y-6">
        {errorAccion ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorAccion}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Total usuarios</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{usuarios.length}</p>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Activos</p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">
              {usuarios.filter((u) => u.activo).length}
            </p>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-2 xl:col-span-1">
            <p className="text-sm text-gray-500">Inactivos</p>
            <p className="mt-2 text-3xl font-bold text-rose-600">
              {usuarios.filter((u) => !u.activo).length}
            </p>
          </div>
        </div>

        <div className="lg:hidden">
          <button
            type="button"
            onClick={abrirModalFormularioNuevo}
            className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95"
          >
            Agregar usuario
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="hidden xl:col-span-4 lg:block">
            <div className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-6">
                <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                  {editandoId ? 'Modo edición' : 'Nuevo registro'}
                </span>

                <h3 className="mt-4 text-xl font-bold text-gray-900 sm:text-2xl">
                  {editandoId ? 'Editar usuario' : 'Registrar usuario'}
                </h3>

                <p className="mt-2 text-sm text-gray-500">
                  {editandoId
                    ? 'Modifica los datos del usuario seleccionado.'
                    : 'Agrega un nuevo usuario al sistema.'}
                </p>
              </div>

              {FormularioUsuario}
            </div>
          </div>

          <div className="xl:col-span-8">
            <div className="overflow-hidden rounded-[30px] border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-5 sm:px-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Listado general</p>
                    <h3 className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">
                      Usuarios registrados
                    </h3>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-600">
                      {usuarios.length} usuarios en total
                    </div>

                    <button
                      type="button"
                      onClick={abrirModalFormularioNuevo}
                      className="hidden rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95 lg:inline-flex xl:hidden"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              </div>

              {usuarios.length > 0 ? (
                <>
                  <div className="space-y-4 p-4 lg:hidden">
                    {usuarios.map((item) => (
                      <div
                        key={item._id}
                        className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-sky-500 text-sm font-bold text-white shadow-sm">
                            {item.nombre?.charAt(0)?.toUpperCase() || 'U'}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-900">{item.nombre}</p>
                            <p className="mt-1 break-all text-sm text-gray-500">{item.email}</p>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getRolClase(
                                  item.rol
                                )}`}
                              >
                                {getRolTexto(item.rol)}
                              </span>

                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                                  item.activo
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-rose-200 bg-rose-50 text-rose-700'
                                }`}
                              >
                                {item.activo ? 'Activo' : 'Inactivo'}
                              </span>

                              {item.debeCambiarPassword ? (
                                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                                  Cambio pendiente
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                            onClick={() => abrirModalFormularioEditar(item)}
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
                            onClick={() => abrirModalEliminar(item)}
                          >
                            Eliminar
                          </button>

                          <button
                            type="button"
                            className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-100 sm:col-span-2"
                            onClick={() => abrirModalRestablecer(item)}
                          >
                            Restablecer acceso
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden overflow-x-auto lg:block">
                    <table className="min-w-full">
                      <thead className="bg-gray-50/80">
                        <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                          <th className="px-6 py-4">Usuario</th>
                          <th className="px-6 py-4">Rol</th>
                          <th className="px-6 py-4">Estado</th>
                          <th className="px-6 py-4 text-right">Acciones</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-gray-100">
                        {usuarios.map((item) => (
                          <tr key={item._id} className="transition hover:bg-slate-50/70">
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-sky-500 text-sm font-bold text-white shadow-sm">
                                  {item.nombre?.charAt(0)?.toUpperCase() || 'U'}
                                </div>

                                <div>
                                  <p className="font-semibold text-gray-900">{item.nombre}</p>
                                  <p className="text-sm text-gray-500">{item.email}</p>
                                </div>
                              </div>
                            </td>

                            <td className="px-6 py-5">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getRolClase(
                                  item.rol
                                )}`}
                              >
                                {getRolTexto(item.rol)}
                              </span>
                            </td>

                            <td className="px-6 py-5">
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                                  item.activo
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-rose-200 bg-rose-50 text-rose-700'
                                }`}
                              >
                                {item.activo ? 'Activo' : 'Inactivo'}
                              </span>
                              {item.debeCambiarPassword ? (
                                <span className="ml-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                                  Cambio pendiente
                                </span>
                              ) : null}
                            </td>

                            <td className="px-6 py-5">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                                  onClick={() => editar(item)}
                                >
                                  Editar
                                </button>

                                <button
                                  type="button"
                                  className="rounded-xl bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-100"
                                  onClick={() => abrirModalRestablecer(item)}
                                >
                                  Restablecer
                                </button>

                                <button
                                  type="button"
                                  className="rounded-xl bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
                                  onClick={() => abrirModalEliminar(item)}
                                >
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto max-w-md">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-100 to-sky-100 text-3xl">
                      👥
                    </div>
                    <h4 className="mt-5 text-xl font-bold text-gray-900">
                      Aún no hay usuarios
                    </h4>
                    <p className="mt-2 text-sm text-gray-500">
                      Cuando registres usuarios, aparecerán aquí para administrarlos de
                      forma rápida.
                    </p>

                    <button
                      type="button"
                      onClick={abrirModalFormularioNuevo}
                      className="mt-6 inline-flex rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95 lg:hidden"
                    >
                      Agregar usuario
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {modalFormulario && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:px-4 lg:hidden"
          onClick={cerrarModalFormulario}
        >
          <div
            className="w-full max-w-lg rounded-[28px] border border-gray-200 bg-white p-5 shadow-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6">
              <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                {editandoId ? 'Modo edición' : 'Nuevo registro'}
              </span>

              <h3 className="mt-4 text-xl font-bold text-gray-900 sm:text-2xl">
                {editandoId ? 'Editar usuario' : 'Registrar usuario'}
              </h3>

              <p className="mt-2 text-sm text-gray-500">
                {editandoId
                  ? 'Modifica los datos del usuario seleccionado.'
                  : 'Agrega un nuevo usuario al sistema.'}
              </p>
            </div>

            {FormularioUsuario}
          </div>
        </div>
      )}

      {modalRestablecer.abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:px-4"
          onClick={cerrarModalRestablecer}
        >
          <div
            className="w-full max-w-md rounded-[28px] border border-gray-200 bg-white p-5 shadow-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-2xl">
              !
            </div>

            <div className="mt-4 text-center">
              <h3 className="text-xl font-bold text-gray-900">
                Restablecer acceso
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Asigna una nueva contraseña temporal para{' '}
                <span className="font-semibold text-gray-800">
                  {modalRestablecer.usuario?.nombre}
                </span>
                . Al iniciar sesión se le pedirá cambiarla.
              </p>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Nueva contraseña temporal
              </label>
              <input
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-100"
                type="password"
                value={passwordTemporalReset}
                onChange={(e) => setPasswordTemporalReset(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
              />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={cerrarModalRestablecer}
                className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmarRestablecer}
                className="rounded-2xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-700"
              >
                Restablecer
              </button>
            </div>
          </div>
        </div>
      )}

      {modalEliminar.abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:px-4"
          onClick={cerrarModalEliminar}
        >
          <div
            className="w-full max-w-md rounded-[28px] border border-gray-200 bg-white p-5 shadow-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-2xl">
              🗑️
            </div>

            <div className="mt-4 text-center">
              <h3 className="text-xl font-bold text-gray-900">Eliminar usuario</h3>
              <p className="mt-2 text-sm text-gray-500">
                ¿Seguro que deseas eliminar a{' '}
                <span className="font-semibold text-gray-800">
                  {modalEliminar.usuario?.nombre}
                </span>
                ? Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={cerrarModalEliminar}
                className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmarEliminacion}
                className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
