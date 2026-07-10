"use client";

import type { ComponentType } from "react";
import {
  Users,
  UsersRound,
  Ruler,
  UtensilsCrossed,
  Salad,
  Droplets,
  Target,
  Layers,
  Boxes,
  UserCircle,
  Flame,
  Activity,
  type LucideProps,
} from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Role } from "@/lib/role/config";

export type Icon = ComponentType<LucideProps>;

export type NavChild = { label: string; href: string };

export type NavItem = {
  key: string;
  label: string;
  href?: string;
  icon: Icon;
  /** Where the bottom tab should navigate (falls back to href). */
  tabHref?: string;
  children?: NavChild[];
};

function nutritionistNav(dict: Dictionary): NavItem[] {
  const t = dict.nav;
  return [
    { key: "groups", label: t.groups, href: "/dashboard/groups", icon: Users },
    {
      key: "patients",
      label: t.patients,
      href: "/dashboard/patients",
      icon: UsersRound,
    },
    {
      key: "anthropometry",
      label: t.anthropometry,
      icon: Ruler,
      tabHref: "/dashboard/antropometria/puntosdecorte",
      children: [
        {
          label: t.cutoffPoints,
          href: "/dashboard/antropometria/puntosdecorte",
        },
        {
          label: t.bicompartmental,
          href: "/dashboard/antropometria/bicompartimental",
        },
        {
          label: t.tetracompartmental,
          href: "/dashboard/antropometria/tetracompartimental",
        },
        {
          label: t.pentacompartmental,
          href: "/dashboard/antropometria/pentacompartimental",
        },
      ],
    },
    {
      key: "nutrition",
      label: t.nutrition,
      icon: UtensilsCrossed,
      tabHref: "/dashboard/alimentacion/alimentacion",
      children: [
        { label: t.food, href: "/dashboard/alimentacion/alimentacion" },
        { label: t.hydration, href: "/dashboard/alimentacion/hidratacion" },
      ],
    },
  ];
}

function userNav(dict: Dictionary): NavItem[] {
  const t = dict.nav;
  return [
    {
      key: "myProfile",
      label: t.myProfile,
      href: "/dashboard/profile",
      icon: UserCircle,
    },
    {
      key: "myCalories",
      label: t.myCalories,
      href: "/dashboard/calories",
      icon: Flame,
    },
    {
      key: "myNutrition",
      label: t.myNutrition,
      href: "/dashboard/nutrition",
      icon: Salad,
    },
    {
      key: "myGlucose",
      label: t.myGlucose,
      href: "/dashboard/glucose",
      icon: Activity,
    },
  ];
}

export function getNavItems(role: Role, dict: Dictionary): NavItem[] {
  return role === "user" ? userNav(dict) : nutritionistNav(dict);
}

// Icons kept around so tree-shaking doesn't drop ones used by future items.
export const _navIcons = { Droplets, Target, Layers, Boxes };
