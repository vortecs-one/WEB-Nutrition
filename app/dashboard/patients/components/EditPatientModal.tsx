"use client";

import { useState } from "react";
import { updatePatient } from "../actions";

type WorkGroup = { id: number; name: string };
type Gender = { id: number; name: string };
type Sport = { id: number; name: string };

type PatientRow = {
  id: number;
  document: string;
  firstName: string;
  lastName: string;
  birthDate: any;
  phone: string | null;
  email: string;
  genderId: number;
  workGroupId: number;
  sportId: number | null;
};

export default function EditPatientModal({
  patient,
  workGroups,
  genders,
  sports,
}: {
  patient: PatientRow;
  workGroups: WorkGroup[];
  genders: Gender[];
  sports: Sport[];
}) {
  const [open, setOpen] = useState(false);

  const birthDateStr = String(patient.birthDate).slice(0, 10);
  const initialSportName =
    patient.sportId ? (sports.find((s) => s.id === patient.sportId)?.name ?? "") : "";

  const [sportName, setSportName] = useState(initialSportName);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-2 py-1 text-xs rounded bg-yellow-500 text-white hover:bg-yellow-600"
      >
        Editar
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form
            action={async (fd) => {
              await updatePatient(patient.id, fd);
              setOpen(false);
            }}
            className="bg-[#5A2A67] p-6 rounded-lg w-full max-w-md space-y-3 border border-white/10"
          >
            <h2 className="text-white text-lg font-semibold text-center">
              EDITAR PACIENTE
            </h2>

            <input
              name="firstName"
              placeholder="Nombre"
              required
              defaultValue={patient.firstName}
              className="w-full rounded px-3 py-2"
            />
            <input
              name="lastName"
              placeholder="Apellidos"
              required
              defaultValue={patient.lastName}
              className="w-full rounded px-3 py-2"
            />
            <input
              name="document"
              placeholder="RUT / DNI / Pasaporte"
              required
              defaultValue={patient.document}
              className="w-full rounded px-3 py-2"
            />

            <div className="flex items-center gap-2">
              <label className="text-white/90 text-sm w-24">F. Nac:</label>
              <input
                name="birthDate"
                type="date"
                required
                defaultValue={birthDateStr}
                className="w-full rounded px-3 py-2"
              />
            </div>

            <input
              name="phone"
              placeholder="Celular"
              defaultValue={patient.phone ?? ""}
              className="w-full rounded px-3 py-2"
            />

            <input
              name="email"
              type="email"
              placeholder="Email (requerido)"
              required
              defaultValue={patient.email}
              className="w-full rounded px-3 py-2"
            />

            <div className="flex items-center gap-2">
              <label className="text-white/90 text-sm w-24">Género:</label>
              <select
                name="genderId"
                required
                defaultValue={patient.genderId}
                className="w-full rounded px-3 py-2"
              >
                {genders.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-white/90 text-sm w-24">Grupo:</label>
              <select
                name="workGroupId"
                required
                defaultValue={patient.workGroupId}
                className="w-full rounded px-3 py-2"
              >
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
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-white/80 hover:underline"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
