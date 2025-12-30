"use client";

import { useState } from "react";
import { createPatient } from "../actions";

type WorkGroup = { id: number; name: string };
type Gender = { id: number; name: string };
type Sport = { id: number; name: string };

export default function AddPatientModal({
  workGroups,
  genders,
  sports,
}: {
  workGroups: WorkGroup[];
  genders: Gender[];
  sports: Sport[];
}) {
  const [open, setOpen] = useState(false);
  const [sportName, setSportName] = useState("");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-sm rounded bg-green-700 text-white hover:bg-green-800 transition"
      >
        + Agregar
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form
            action={async (fd) => {
              await createPatient(fd);
              setOpen(false);
            }}
            className="bg-[#5A2A67] p-6 rounded-lg w-full max-w-md space-y-3 border border-white/10"
          >
            <h2 className="text-white text-lg font-semibold text-center">
              AGREGAR PACIENTE
            </h2>

            <input name="firstName" placeholder="Nombre" required className="w-full rounded px-3 py-2" />
            <input name="lastName" placeholder="Apellidos" required className="w-full rounded px-3 py-2" />
            <input name="document" placeholder="RUT / DNI / Pasaporte" required className="w-full rounded px-3 py-2" />

            <div className="flex items-center gap-2">
              <label className="text-white/90 text-sm w-24">F. Nac:</label>
              <input name="birthDate" type="date" required className="w-full rounded px-3 py-2" />
            </div>

            <input name="phone" placeholder="Celular" className="w-full rounded px-3 py-2" />

            <input
              name="email"
              type="email"
              placeholder="Email (requerido)"
              required
              className="w-full rounded px-3 py-2"
            />

            <div className="flex items-center gap-2">
              <label className="text-white/90 text-sm w-24">Género:</label>
              <select name="genderId" required className="w-full rounded px-3 py-2">
                {genders.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-white/90 text-sm w-24">Grupo:</label>
              <select name="workGroupId" required className="w-full rounded px-3 py-2">
                {workGroups.map((wg) => (
                  <option key={wg.id} value={wg.id}>
                    {wg.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-white/90 text-sm w-24">Actividad:</label>
              <input
                name="sportName"
                list="sports"
                placeholder="Deporte o actividad"
                className="w-full rounded px-3 py-2"
                value={sportName}
                onChange={(e) => setSportName(e.target.value)}
              />
              <datalist id="sports">
                {sports.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </div>

            <p className="text-xs text-white/70 pl-[104px]">
              Si no existe, escríbela y se creará automáticamente.
            </p>

            <div className="flex gap-2 pt-4 justify-center">
              <button type="submit" className="bg-black text-white px-6 py-2 rounded">
                Agregar
              </button>
              <button type="button" onClick={() => setOpen(false)} className="text-white/80 hover:underline">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
