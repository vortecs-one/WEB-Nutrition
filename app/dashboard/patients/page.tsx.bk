import { db } from "@/lib/db";
import { workGroups, genders, sports, patients } from "@/drizzle/schema";
import { deletePatient } from "./actions";
import AddPatientModal from "./components/AddPatientModal";
import EditPatientModal from "./components/EditPatientModal";
import { desc, eq } from "drizzle-orm";

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ficha paciente</h1>
          <p className="text-sm text-muted-foreground">
            En esta sección puedes gestionar las fichas de tus pacientes.
          </p>
        </div>

        <AddPatientModal workGroups={groups} genders={genderList} sports={sportsList} />
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden bg-white">
        {/* Header row (12 cols) */}
        <div className="grid grid-cols-12 gap-2 bg-slate-900 text-white px-4 py-3 text-sm font-medium">
          <div className="col-span-2">Documento</div>
          <div className="col-span-2">Nombre</div>
          <div className="col-span-2">Email</div>
          <div className="col-span-2">Teléfono</div>      
          <div className="col-span-2">Actividad</div>
          <div className="col-span-2 text-right">Acciones</div>
        </div>

        {rows.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Sin pacientes aún.</div>
        ) : (
          rows.map((p) => (
            <div
              key={p.id}
              className="border-b last:border-b-0 hover:bg-slate-50"
            >
              {/* Row line 1 (main columns) */}
              <div className="grid grid-cols-12 gap-2 px-4 pt-3 text-sm">
                <div className="col-span-2">{p.document}</div>

                <div className="col-span-2">
                  {p.firstName} {p.lastName}
                </div>

                <div className="col-span-2">
                  <span className="break-all">{p.email}</span>
                </div>

                <div className="col-span-2">
                  <span>{p.phone ?? "—"}</span>
                </div>                

                <div className="col-span-2">
                  {p.sportName ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {p.sportName}
                    </span>
                  ) : (
                    "—"
                  )}
                </div>

                <div className="col-span-2 flex items-center justify-end gap-2">
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
                  
                    <button className="bg-red-600 text-white px-3 py-1 rounded text-sm">
                      Eliminar
                    </button>
                  
                  </form>
                </div>
              
              </div>             
            </div>
          ))
        )}
      </div>
    </div>
  );
}
