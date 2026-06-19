// app/dashboard/page.tsx
export default function DashboardHomePage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">
        Mi Dashboard
      </h1>
      <p className="text-sm text-muted-foreground">
        Selecciona una sección en el menú de la izquierda para ver tu información nutricional.
      </p>
    </div>
  );
}
