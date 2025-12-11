"use server";

import { db } from "@/lib/db";
import { workGroups } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createWorkGroup(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() || "Activo";
  const createdAtStr = String(formData.get("createdAt") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;

  if (!name) {
    throw new Error("El nombre del grupo es obligatorio.");
  }

  const createdAt = createdAtStr ? new Date(createdAtStr) : new Date();

  await db.insert(workGroups).values({
    name,
    status,
    createdAt,
    logoUrl: logoUrl || null,
  });

  // Refresca la página de grupos
  revalidatePath("/dashboard/groups");
}

export async function updateWorkGroup(formData: FormData) {
  const idStr = String(formData.get("id") ?? "").trim();
  const id = Number(idStr);

  if (!id || Number.isNaN(id)) {
    throw new Error("ID inválido para actualizar grupo.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() || "Activo";
  const createdAtStr = String(formData.get("createdAt") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;

  if (!name) {
    throw new Error("El nombre del grupo es obligatorio.");
  }

  const createdAt = createdAtStr ? new Date(createdAtStr) : undefined;

  await db
    .update(workGroups)
    .set({
      name,
      status,
      ...(createdAt ? { createdAt } : {}),
      logoUrl: logoUrl || null,
    })
    .where(eq(workGroups.id, id));

  revalidatePath("/dashboard/groups");
}

export async function deleteWorkGroup(formData: FormData) {
  const idStr = String(formData.get("id") ?? "").trim();
  const id = Number(idStr);

  if (!id || Number.isNaN(id)) {
    throw new Error("ID inválido para eliminar grupo.");
  }

  await db.delete(workGroups).where(eq(workGroups.id, id));
  revalidatePath("/dashboard/groups");
}
