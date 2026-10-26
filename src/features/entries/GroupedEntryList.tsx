import {useId, useMemo, useState} from "react";
import type {ReactNode} from "react";
import {EmptyState} from "../../components/ui";
import {contactLabel, horseLabel} from "../../lib/display";
import type {Locale} from "../../lib/i18n";
import type {Block, ClassRecord, Contact, Entry, Horse} from "../../types/domain";
import {uiText} from "../dashboard/shared";
import {entryClassLabel, entryClassPatternDetail} from "./entryDisplay";

const searchable = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function GroupedEntryList({entries, horses, contacts, classes, blocks, locale, header, renderEntry, emptyLabel, tableClassName = ""}: {
  entries: Entry[]; horses: Horse[]; contacts: Contact[]; classes: ClassRecord[]; blocks: Block[];
  locale: Locale; header: ReactNode; renderEntry: (entry: Entry) => ReactNode; emptyLabel: string; tableClassName?: string;
}) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const terms = searchable(query).trim().split(/\s+/).filter(Boolean);
  const groups = useMemo(() => {
    const horseById = new Map(horses.map(horse => [horse.id, horse]));
    const contactById = new Map(contacts.map(contact => [contact.id, contact]));
    const classById = new Map(classes.map(record => [record.id, record]));
    const grouped = new Map<string, {id: string; name: string; rows: Array<{entry: Entry; search: string}>}>();
    for (const entry of entries) {
      const group = grouped.get(entry.horse_id) ?? {id: entry.horse_id, name: horseLabel(horseById.get(entry.horse_id)), rows: []};
      const record = classById.get(entry.class_id);
      const search = searchable([
        group.name, entry.entry_number ?? "", entryClassLabel(record, locale),
        entryClassPatternDetail(record, blocks, locale),
        entry.rider_contact_id ? contactLabel(contactById.get(entry.rider_contact_id)) : "",
        contactLabel(contactById.get(entry.owner_contact_id)),
      ].join(" "));
      group.rows.push({entry, search});
      grouped.set(entry.horse_id, group);
    }
    return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name, locale, {sensitivity: "base", numeric: true}) || a.id.localeCompare(b.id));
  }, [entries, horses, contacts, classes, blocks, locale]);
  const visible = groups.map(group => ({...group, matching: group.rows.filter(row => terms.every(term => row.search.includes(term)))})).filter(group => group.matching.length);
  const visibleEntries = visible.reduce((count, group) => count + group.matching.length, 0);
  return <div className="grouped-entry-list">
    <div className="entry-search-controls">
      <label>{uiText(locale, "Rechercher dans les inscriptions", "Search entries")}
        <input type="search" value={query} aria-controls={listId} placeholder={uiText(locale, "Cheval, cavalier, propriétaire, classe ou dossard…", "Horse, rider, owner, class or back number…")} onChange={event => setQuery(event.target.value)}/>
      </label>
      {query ? <button type="button" className="ghost-button" onClick={() => setQuery("")}>{uiText(locale, "Effacer la recherche", "Clear search")}</button> : null}
    </div>
    <p className="muted-line" role="status">{uiText(locale, `${visible.length} cheval${visible.length > 1 ? "s" : ""} · ${visibleEntries} inscription${visibleEntries > 1 ? "s" : ""}`, `${visible.length} horse${visible.length === 1 ? "" : "s"} · ${visibleEntries} ${visibleEntries === 1 ? "entry" : "entries"}`)}</p>
    <div id={listId}>
      {visible.map(group => <details className="entry-horse-group" key={group.id} open={terms.length ? true : undefined}>
        <summary><strong>{group.name}</strong><span className="badge">{terms.length && group.matching.length !== group.rows.length ? `${group.matching.length} / ${group.rows.length}` : group.rows.length} {uiText(locale, group.rows.length > 1 ? "inscriptions" : "inscription", group.rows.length > 1 ? "entries" : "entry")}</span></summary>
        <div className={`table ${tableClassName}`}><div className="table-row table-head">{header}</div>{group.matching.map(({entry}) => renderEntry(entry))}</div>
      </details>)}
      {!entries.length ? <EmptyState label={emptyLabel}/> : !visible.length ? <EmptyState label={uiText(locale, "Aucune inscription ne correspond à la recherche.", "No entries match your search.")}/> : null}
    </div>
  </div>;
}
