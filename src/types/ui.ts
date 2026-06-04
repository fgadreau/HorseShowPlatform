import type { ComponentType } from "react";
import type { Translation } from "../lib/i18n";

export type ViewKey =
  | "overview"
  | "shows"
  | "people"
  | "health"
  | "classes"
  | "entries"
  | "stalls"
  | "scoring"
  | "billing"
  | "settings"
  | "my-horses"
  | "my-riders"
  | "my-entries"
  | "my-stalls"
  | "my-invoices";

export type Notice = {
  tone: "success" | "error" | "info";
  message: string;
};

export type NavItem = {
  icon: ComponentType<{ size?: number }>;
  key: ViewKey;
  labelKey: keyof Translation["nav"];
};
