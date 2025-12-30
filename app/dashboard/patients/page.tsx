import { db } from "@/lib/db";
import { workGroups, genders, sports, patients } from "@/drizzle/schema";
import { deletePatient } from "./actions";
import AddPatientModal from "./components/AddPatientModal";
import EditPatientModal from "./components/EditPatientModal";
import { desc, eq } from "drizzle-orm";

function formatDate(value: string | Date | null) {
  if (!value) return "-";
  const d = new Date(value);
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

export default async function PatientsPage() {
  const [groups, genderList, sportsList, rows] = await Promise.all([
    db.select().from(workGroups),
    db.select().from(genders),
    db.select().from(sports),
    db
      .select({
        // fields required by EditPatientModal
        id: patients.id,
        document: patients.document,
        firstName: patients.firstName,
        lastName: patients.lastName,
        email: patients.email,
        phone: patients.phone,
        genderId: patients.genderId,
        workGroupId: patients.workGroupId,
        sportId: patients.sportId,
        birthDate: patients.birthDate,

        // display fields
        genderName: genders.name,
        groupName: workGroups.name,
        sportName: sports.name,
      })
      .from(patients)
      .innerJoin(genders, eq(patients.genderId, genders.id))
      .innerJoin(workGroups, eq(patients.workGroupId, workGroups.id))
      .leftJoin(sports, eq(patients.sportId, sports.id))
      .orderBy(desc(patients.id)),
  ]);

  return (
    <>
      {/* Header de sección (same as groups) */}
      <div className="bg-purple-800 text-white px-6 py-4 rounded-md shadow-sm mb-4">
        <h1 className="text-lg font-semibold">Pacientes</h1>
        <p className="text-sm text-purple-100">
          En esta sección puedes gestionar las fichas de tus pacientes.
        </p>
      </div>

      {/* Tabla container (same as groups) */}
      <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="font-medium text-sm">Listado de pacientes</h2>

          {/* Keep your current AddPatientModal trigger */}
          <AddPatientModal workGroups={groups} genders={genderList} sports={sportsList} />
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-white">
            <tr>
              <th className="px-4 py-2 text-left">Documento</th>
              <th className="px-4 py-2 text-left">Paciente</th>
              <th className="px-4 py-2 text-left">Género</th>
              <th className="px-4 py-2 text-left">Grupo</th>
              <th className="px-4 py-2 text-left">Actividad</th>
              <th className="px-4 py-2 text-left">Nacimiento</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Teléfono</th>
              <th className="px-4 py-2 text-right w-40">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((p, idx) => (
              <tr
                key={p.id}
                className={
                  idx === 0
                    ? "bg-purple-50 border-b border-gray-200"
                    : "border-b border-gray-100"
                }
              >
                <td className="px-4 py-2 text-gray-800">{p.document}</td>

                <td className="px-4 py-2 font-medium text-gray-800">
                  {p.firstName} {p.lastName}
                </td>

                <td className="px-4 py-2">
                  <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200">
                    {p.genderName}
                  </span>
                </td>

                <td className="px-4 py-2">
                  <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200">
                    {p.groupName}
                  </span>
                </td>

                <td className="px-4 py-2">
                  {p.sportName ? (
                    <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200">
                      {p.sportName}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>

                <td className="px-4 py-2 text-gray-600">
                  {formatDate(p.birthDate)}
                </td>

                <td className="px-4 py-2 text-gray-700">{p.email}</td>
                <td className="px-4 py-2 text-gray-700">{p.phone ?? "—"}</td>

                <td className="px-4 py-2">
                  <div className="flex justify-end gap-2">
                    <EditPatientModal
                      patient={p}
                      workGroups={groups}
                      genders={genderList}
                      sports={sportsList}
                    />

                    <form
                      action={async () => {
                        "use server";
                        await deletePatient(p.id);
                      }}
                    >
                      <button
                        type="submit"
                        className="px-2 py-1 text-xs rounded bg-red-500 text-white hover:bg-red-600"
                      >
                        Eliminar
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-500 text-sm">
                  No hay pacientes registrados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Optional note (same feel as groups) */}
        <div className="px-4 py-3 text-xs text-slate-600 bg-slate-50 border-t border-slate-100">
          💡 Tip: el <strong>Email</strong> y el <strong>Documento</strong> son únicos.
        </div>
      </div>
    </>
  );
}
