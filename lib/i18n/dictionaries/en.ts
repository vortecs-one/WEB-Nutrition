import type { Dictionary } from "./es";

// English dictionary. Must implement the same shape as the Spanish one.
const en: Dictionary = {
  common: {
    appName: "NutritionAI",
    panel: "Panel",
    loading: "Loading...",
    save: "Save",
    cancel: "Cancel",
    language: "Language",
  },
  nav: {
    sectionTitle: "Dashboard",
    groups: "Groups",
    patients: "Patients",
    anthropometry: "Anthropometry",
    cutoffPoints: "Cut-off points",
    bicompartmental: "Bicompartmental",
    tetracompartmental: "Tetracompartmental",
    pentacompartmental: "Pentacompartmental",
    nutrition: "Nutrition",
    food: "Food",
    hydration: "Hydration",
  },
  topbar: {
    plan: "Standard",
    defaultUser: "User",
    logout: "Sign out",
  },
  dashboard: {
    title: "Nutrition dashboard",
    subtitle: "Select an option from the menu on the left to get started.",
  },
  auth: {
    loginTitle: "Login",
    login: "Login",
    registerTitle: "Create account",
    register: "Register",
    email: "Email",
    password: "Password",
    invalidCredentials: "Invalid credentials.",
    registrationFailed: "Registration failed.",
    accountCreated: "Account created successfully! Redirecting...",
    haveAccount: "Already have an account?",
  },
};

export default en;
