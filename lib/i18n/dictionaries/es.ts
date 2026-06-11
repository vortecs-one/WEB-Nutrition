// Spanish dictionary (default language).
// Keep keys in sync across all dictionary files.
const es = {
  common: {
    appName: "NutritionAI",
    panel: "Panel",
    loading: "Cargando...",
    save: "Guardar",
    cancel: "Cancelar",
    language: "Idioma",
  },
  nav: {
    sectionTitle: "Panel",
    groups: "Grupos",
    patients: "Pacientes",
    anthropometry: "Antropometría",
    cutoffPoints: "Puntos de corte",
    bicompartmental: "Bicompartimental",
    tetracompartmental: "Tetracompartimental",
    pentacompartmental: "Pentacompartimental",
    nutrition: "Nutrición",
    food: "Alimentación",
    hydration: "Hidratación",
  },
  topbar: {
    plan: "Estandar",
    defaultUser: "Usuario",
    logout: "Cerrar sesión",
  },
  dashboard: {
    title: "Dashboard nutricional",
    subtitle: "Selecciona una opción en el menú de la izquierda para comenzar.",
  },
  auth: {
    loginTitle: "Iniciar sesión",
    login: "Iniciar sesión",
    registerTitle: "Crear cuenta",
    register: "Registrarse",
    email: "Correo electrónico",
    password: "Contraseña",
    invalidCredentials: "Credenciales inválidas.",
    registrationFailed: "Error al registrarse.",
    accountCreated: "¡Cuenta creada con éxito! Redirigiendo...",
    haveAccount: "¿Ya tienes una cuenta?",
  },
} as const;

export default es;

// The shape of every dictionary is derived from the Spanish one,
// guaranteeing all languages stay in sync at compile time.
export type Dictionary = typeof es;
