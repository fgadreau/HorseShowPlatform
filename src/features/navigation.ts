import { Bell, BookOpen, Building2, CalendarDays, CircleDollarSign, ClipboardList, Hash, HeartPulse, LayoutDashboard, ShieldCheck, Tent, Trophy, UserCircle, Users, Warehouse } from "lucide-react";
import type { NavItem, ViewKey } from "../types/ui";

export const associationNavigation: NavItem[] = [
  { key: "overview", labelKey: "overview", icon: Building2 },
  { key: "notifications", labelKey: "notifications", icon: Bell },
  { key: "shows", labelKey: "shows", icon: CalendarDays },
  { key: "people", labelKey: "people", icon: Users },
  { key: "health", labelKey: "health", icon: HeartPulse },
  { key: "classes", labelKey: "classes", icon: BookOpen },
  { key: "entries", labelKey: "entries", icon: ClipboardList },
  { key: "back-numbers", labelKey: "backNumbers", icon: Hash },
  { key: "stalls", labelKey: "stalls", icon: Warehouse },
  { key: "scoring", labelKey: "scoring", icon: Trophy },
  { key: "billing", labelKey: "billing", icon: CircleDollarSign },
  { key: "settings", labelKey: "settings", icon: ShieldCheck },
];

export const personalNavigation: NavItem[] = [
  { key: "my-overview", labelKey: "myOverview", icon: LayoutDashboard },
  { key: "my-profile", labelKey: "myProfile", icon: UserCircle },
  { key: "my-horses", labelKey: "myHorses", icon: ClipboardList },
  { key: "my-riders", labelKey: "myRiders", icon: Users },
  { key: "my-entries", labelKey: "myEntries", icon: CalendarDays },
  { key: "my-back-numbers", labelKey: "myBackNumbers", icon: Hash },
  { key: "my-stalls", labelKey: "myStalls", icon: Tent },
  { key: "my-invoices", labelKey: "myInvoices", icon: CircleDollarSign },
];

export const associationViewKeys = new Set<ViewKey>(associationNavigation.map((item) => item.key));
