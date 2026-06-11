import type { ComponentType } from "react";
import type { Translation } from "../lib/i18n";

export type ViewKey =
  | "overview"
  | "notifications"
  | "shows"
  | "people"
  | "health"
  | "classes"
  | "entries"
  | "back-numbers"
  | "stalls"
  | "scoring"
  | "billing"
  | "settings"
  | "my-overview"
  | "my-profile"
  | "my-horses"
  | "my-riders"
  | "my-entries"
  | "my-back-numbers"
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
