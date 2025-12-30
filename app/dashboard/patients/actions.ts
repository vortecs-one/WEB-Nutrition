"use server";

import { db } from "@/lib/db";
import { patients, sports } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const clean = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const cleanOrNull = (v: FormDataEntryValue | null) => {
  const s = clean(v);
  return s ? s : null;
};

async function ensureSportIdByName(sportName: string) {
  const name = sportName.trim();
  if (!name) return null;

  const found = await db
    .select({ id: sports.id })
    .from(sports)
    .where(eq(sports.name, name))
    .limit(1);

  if (found.length) return found[0].id;

  const inserted = await db
    .insert(sports)
    .values({ name })
    .returning({ id: sports.id });

  return inserted[0].id;
}

export async function createPatient(formData: FormData) {
  const document = clean(formData.get("document"));
  const firstName = clean(formData.get("firstName"));
  const lastName = clean(formData.get("lastName"));
  const birthDate = clean(formData.get("birthDate"));

  const phone = cleanOrNull(formData.get("phone"));
  const email = clean(formData.get("email")); // required

  const genderId = Number(clean(formData.get("genderId")));
  const workGroupId = Number(clean(formData.get("workGroupId")));
  const sportName = clean(formData.get("sportName"));

  if (!document || !firstName || !lastName || !birthDate || !email) {
    throw new Error("Faltan campos obligatorios.");
  }
  if (!genderId || !workGroupId) {
    throw new Error("Debes seleccionar un género y un grupo.");
  }

  const sportId = await ensureSportIdByName(sportName);

  await db.insert(patients).values({
    document,
    firstName,
    lastName,
    birthDate,
    phone,
    email,
    genderId,
    workGroupId,
    sportId,
  });

  revalidatePath("/dashboard/patients");
}

export async function updatePatient(id: number, formData: FormData) {
  const document = clean(formData.get("document"));
  const firstName = clean(formData.get("firstName"));
  const lastName = clean(formData.get("lastName"));
  const birthDate = clean(formData.get("birthDate"));

  const phone = cleanOrNull(formData.get("phone"));
  const email = clean(formData.get("email")); // required

  const genderId = Number(clean(formData.get("genderId")));
  const workGroupId = Number(clean(formData.get("workGroupId")));
  const sportName = clean(formData.get("sportName"));

  if (!document || !firstName || !lastName || !birthDate || !email) {
    throw new Error("Faltan campos obligatorios.");
  }
  if (!genderId || !workGroupId) {
    throw new Error("Debes seleccionar un género y un grupo.");
  }

  const sportId = await ensureSportIdByName(sportName);

  await db
    .update(patients)
    .set({
      document,
      firstName,
      lastName,
      birthDate,
      phone,
      email,
      genderId,
      workGroupId,
      sportId,
      updatedAt: new Date(),
    })
    .where(eq(patients.id, id));

  revalidatePath("/dashboard/patients");
}

export async function deletePatient(id: number) {
  await db.delete(patients).where(eq(patients.id, id));
  revalidatePath("/dashboard/patients");
}
