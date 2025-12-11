"use client";

import { useState } from "react";
import { createWorkGroup, updateWorkGroup, deleteWorkGroup } from "./actions";

type WorkGroup = {
  id: number;
  name: string;
  status: string;
  createdAt: string | Date;
  logoUrl: string | null;
};

type Props = {
  groups: WorkGroup[];
};

function formatDate(value: string | Date | null) {
  if (!value) return "-";
  const d = new Date(value);
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

export default function WorkGroupsTable({ groups }: Props) {
  const [modal, setModal] = useState<
    null | { mode: "create" } | { mode: "edit"; group: WorkGroup }
  >(null);

  const currentGroup = modal && modal.mode === "edit" ? modal.group : null;

  return (
    <>
      {/* Header de sección */}
      <div className="bg-purple-800 text-white px-6 py-4 rounded-md shadow-sm mb-4">
        <h1 className="text-lg font-semibold">Grupos de trabajo</h1>
        <p className="text-sm text-purple-100">
          En esta sección puedes gestionar los grupos de trabajo que asignarás a
          tus pacientes.
        </p>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="font-medium text-sm">Listado de grupos</h2>
          <button
            onClick={() => setModal({ mode: "create" })}
            className="px-3 py-1.5 text-sm rounded bg-purple-700 text-white hover:bg-purple-800 transition"
          >
            + Agregar
          </button>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-white">
            <tr>
              <th className="px-4 py-2 text-left w-16">Logo</th>
              <th className="px-4 py-2 text-left">Grupo</th>
              <th className="px-4 py-2 text-left">Estado</th>
              <th className="px-4 py-2 text-left">Creación</th>
              <th className="px-4 py-2 text-right w-40">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, idx) => (
              <tr
                key={group.id}
                className={
                  idx === 0
                    ? "bg-purple-50 border-b border-gray-200"
                    : "border-b border-gray-100"
                }
              >
                {/* Logo */}
                <td className="px-4 py-2">
                  <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
                    {group.name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                </td>

                {/* Nombre */}
                <td className="px-4 py-2 font-medium text-gray-800">
                  {group.name}
                </td>

                {/* Estado */}
                <td className="px-4 py-2">
                  <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 border border-green-200">
                    {group.status}
                  </span>
                </td>

                {/* Fecha */}
                <td className="px-4 py-2 text-gray-600">
                  {formatDate(group.createdAt)}
                </td>

                {/* Acciones */}
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setModal({ mode: "edit", group })}
                      className="px-2 py-1 text-xs rounded bg-yellow-500 text-white hover:bg-yellow-600"
                    >
                      Editar
                    </button>

                    {/* Delete: server action */}
                    <form action={deleteWorkGroup}>
                      <input
                        type="hidden"
                        name="id"
                        value={String(group.id)}
                      />
                      <button
                        type="submit"
                        className="px-2 py-1 text-xs rounded bg-red-500 text-white hover:bg-red-600"
                        onClick={(e) => {
                          if (
                            !window.confirm(
                              "¿Seguro que quieres eliminar este grupo?"
                            )
                          ) {
                            e.preventDefault();
                          }
                        }}
                      >
                        Eliminar
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}

            {groups.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-gray-500 text-sm"
                >
                  No hay grupos registrados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Nota inferior */}
        <div className="px-4 py-3 text-xs text-red-600 bg-red-50 border-t border-red-100">
          ⚠ Si borras un grupo de trabajo, los pacientes que pertenecen a dicho
          grupo se moverán al grupo <strong>"General"</strong>.
        </div>
      </div>

      {/* Modal Crear / Editar */}
      {modal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-lg border border-slate-200">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">
                {modal.mode === "create" ? "Agregar grupo" : "Editar grupo"}
              </h3>
              <button
                onClick={() => setModal(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <form
              className="px-5 py-4 space-y-3 text-sm"
              action={
                modal.mode === "create" ? createWorkGroup : updateWorkGroup
              }
              onSubmit={() => {
                // el server action revalida la ruta; aquí solo cerramos el modal
                setModal(null);
              }}
            >
              {modal.mode === "edit" && currentGroup && (
                <input
                  type="hidden"
                  name="id"
                  value={String(currentGroup.id)}
                />
              )}

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">
                  Nombre del grupo
                </label>
                <input
                  name="name"
                  defaultValue={currentGroup?.name ?? ""}
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Ej: TEAM PEÑALOLEN HOMBRE"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">
                  Estado
                </label>
                <select
                  name="status"
                  defaultValue={currentGroup?.status ?? "Activo"}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">
                  Fecha de creación
                </label>
                <input
                  type="date"
                  name="createdAt"
                  defaultValue={
                    currentGroup
                      ? new Date(currentGroup.createdAt)
                          .toISOString()
                          .slice(0, 10)
                      : ""
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">
                  Logo (URL opcional)
                </label>
                <input
                  name="logoUrl"
                  defaultValue={currentGroup?.logoUrl ?? ""}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="https://..."
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-purple-600 px-4 py-2 text-xs font-medium text-white hover:bg-purple-700"
                >
                  {modal.mode === "create" ? "Guardar" : "Actualizar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
