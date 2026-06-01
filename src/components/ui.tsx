import { useEffect, useMemo, useState } from "react";
import { Globe2 } from "lucide-react";
import type { ComponentType } from "react";
import type { Locale } from "../lib/i18n";
import { findById, itemSearchLabel } from "../lib/display";
import type { Notice } from "../types/ui";

export function LanguageToggle({ locale, onLocaleChange }: { locale: Locale; onLocaleChange: (locale: Locale) => void }) {
  return (
    <div className="language-toggle" aria-label="Language">
      <Globe2 size={16} />
      <button className={locale === "fr" ? "active" : ""} type="button" onClick={() => onLocaleChange("fr")}>
        FR
      </button>
      <button className={locale === "en" ? "active" : ""} type="button" onClick={() => onLocaleChange("en")}>
        EN
      </button>
    </div>
  );
}

export function SearchSelect({
  allowEmpty = false,
  disabled = false,
  items,
  placeholder,
  value,
  onChange,
}: {
  allowEmpty?: boolean;
  disabled?: boolean;
  items: Array<{ id: string; label: string; detail?: string }>;
  placeholder: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const listId = useMemo(() => `search-${Math.random().toString(36).slice(2)}`, []);
  const selectedItem = findById(items, value);
  const [query, setQuery] = useState(selectedItem ? itemSearchLabel(selectedItem) : "");

  useEffect(() => {
    const nextItem = findById(items, value);
    setQuery(nextItem ? itemSearchLabel(nextItem) : "");
  }, [items, value]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = items.filter((item) => itemSearchLabel(item).toLowerCase().includes(normalizedQuery)).slice(0, 30);

  function handleInput(nextQuery: string) {
    setQuery(nextQuery);

    if (allowEmpty && !nextQuery.trim()) {
      onChange("");
      return;
    }

    const exactMatch = items.find((item) => itemSearchLabel(item).toLowerCase() === nextQuery.trim().toLowerCase());
    onChange(exactMatch?.id ?? "");
  }

  return (
    <div className="search-select">
      <input
        disabled={disabled}
        list={listId}
        placeholder={placeholder}
        value={query}
        onBlur={() => {
          if (!allowEmpty && !findById(items, value)) {
            setQuery("");
          }
        }}
        onChange={(event) => handleInput(event.target.value)}
      />
      <datalist id={listId}>
        {visibleItems.map((item) => (
          <option key={item.id} value={itemSearchLabel(item)} />
        ))}
      </datalist>
    </div>
  );
}

export function FormActions({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return (
    <div className="form-actions">
      <button className="primary-button" disabled={busy} type="submit">
        Save changes
      </button>
      <button className="ghost-button" disabled={busy} type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <section className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

export function WorkflowStep({ icon: Icon, label, state }: { icon: ComponentType<{ size?: number }>; label: string; state: string }) {
  return (
    <div className="workflow-step">
      <Icon size={20} />
      <div>
        <strong>{label}</strong>
        <span>{state}</span>
      </div>
    </div>
  );
}

export function NoticeBanner({ notice }: { notice: Notice }) {
  return <div className={`notice ${notice.tone}`}>{notice.message}</div>;
}

export function EmptyState({ label }: { label: string }) {
  return <div className="empty-state">{label}</div>;
}
