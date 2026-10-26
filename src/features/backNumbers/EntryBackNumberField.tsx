import { useEffect, useState } from "react";
import { billingRpc } from "../../services/billingFolio";
import { errorMessage, formatCurrency } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { uiText } from "../dashboard/shared";

export type EntryBackNumberSelection = { choice: "reuse" | "personal" | "request"; number: number | null; ready: boolean; requestFee?: number };
type Options = { number: number | null; association_issued: boolean; requires_association: boolean; fee: number; auto_assign: boolean; pending: boolean };

export function EntryBackNumberField({ orgId, horseId, blockIds, currency, locale, onChange }: {
  orgId: string; horseId: string; blockIds: string[]; currency: string; locale: Locale;
  onChange: (value: EntryBackNumberSelection) => void;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<EntryBackNumberSelection["choice"]>("reuse");
  const [number, setNumber] = useState("");
  const blockKey = [...blockIds].sort().join(",");
  useEffect(() => {
    let live = true;
    setOptions(null); setError("");
    onChange({ choice: "reuse", number: null, ready: false });
    if (horseId) void billingRpc("entry_back_number_options", { p_org: orgId, p_horse: horseId, p_blocks: blockKey ? blockKey.split(",") : [] })
      .then((result: Options) => {
        if (!live) return;
        setOptions(result);
        setChoice(current => {
          if (result.pending || (result.requires_association && !result.association_issued)) return "request";
          if (result.requires_association && current === "personal") return "reuse";
          if (current === "reuse" && !result.number) return "personal";
          return current;
        });
      }).catch((failure) => { if (live) setError(errorMessage(failure)); });
    return () => { live = false; };
  }, [orgId, horseId, blockKey, onChange]);
  useEffect(() => {
    const parsed = Number(number);
    const valid = choice !== "personal" || (Number.isInteger(parsed) && parsed > 0 && parsed <= 2147483647);
    onChange({ choice, number: choice === "personal" ? parsed : choice === "reuse" ? options?.number ?? null : null, ready: Boolean(options) && valid, requestFee: choice === "request" && options && !options.pending ? options.fee : 0 });
  }, [choice, number, options, onChange]);
  if (!horseId) return <p>{uiText(locale, "Choisis un cheval pour rechercher son dossard dans l'association.", "Choose a horse to look up its association back number.")}</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!options) return <p role="status">{uiText(locale, "Recherche du dossard…", "Looking up back number…")}</p>;
  const mustRequest = options.pending || (options.requires_association && !options.association_issued);
  return <fieldset className="stack nested-fieldset">
    <legend>{uiText(locale, "Dossard du cheval", "Horse back number")}</legend>
    {options.number ? <p>{uiText(locale, `Dossard actuel dans cette association : ${options.number}.`, `Current back number in this association: ${options.number}.`)}</p> : null}
    {options.requires_association ? <p>{uiText(locale, "Un bloc sélectionné impose un dossard fourni par l'association. Il remplacera tout numéro personnel du cheval.", "A selected block requires an association-issued number. It will replace the horse's personal number.")}</p> : null}
    {options.pending ? <p role="status">{uiText(locale, "Une demande est déjà en attente : elle sera réutilisée sans nouveaux frais.", "A request is already pending and will be reused without another fee.")}</p> : null}
    <label>{uiText(locale, "Choix du dossard", "Back number choice")}
      <select disabled={mustRequest} value={mustRequest ? "request" : choice} onChange={(event) => setChoice(event.target.value as EntryBackNumberSelection["choice"])}>
        {options.number && (!options.requires_association || options.association_issued) ? <option value="reuse">{uiText(locale, "Réutiliser le dossard actuel", "Reuse current back number")}</option> : null}
        {!options.requires_association && !options.pending ? <option value="personal">{uiText(locale, "Fournir un numéro libre", "Provide an unused number")}</option> : null}
        <option value="request">{uiText(locale, "Demander un nouveau dossard à l'association", "Request a new number from the association")}</option>
      </select>
    </label>
    {choice === "personal" && !mustRequest ? <label>{uiText(locale, "Numéro de dossard", "Back number")}<input aria-label={uiText(locale, "Numéro de dossard", "Back number")} type="number" min="1" max="2147483647" step="1" value={number} onChange={(event) => setNumber(event.target.value)} /><span className="input-help">{uiText(locale, "Le numéro doit être libre dans l'association. Il restera associé au cheval, même après une annulation.", "The number must be unused in the association. It stays with the horse even after cancellation.")}</span></label> : null}
    {choice === "request" || mustRequest ? <p>{uiText(locale, "Frais de la demande : ", "Request fee: ")}{formatCurrency(options.pending ? 0 : options.fee, currency)}. {uiText(locale,
      options.auto_assign ? "Assignation automatique si un dossard est disponible ; sinon le secrétariat traitera la demande." : "Le secrétariat assignera le dossard.",
      options.auto_assign ? "Automatically assigned when stock is available; otherwise the office will handle the request." : "The office will assign the number.")}
      {" "}{uiText(locale, "L'inscription est permise en attente, mais l'ordre de passage restera bloqué. Les frais sont conservés si l'inscription est annulée.", "Entries can remain pending, but the draw is blocked until assignment. The fee is retained if the entry is cancelled.")}</p> : null}
  </fieldset>;
}
