import type { Locale } from "../../lib/i18n";
import { uiText } from "../dashboard/shared";
export function BlockBackNumberPolicy({locale,required,fee,onRequired,onFee}:{locale:Locale;required:boolean;fee:string;onRequired:(value:boolean)=>void;onFee:(value:string)=>void}) {
  return <fieldset className="stack nested-fieldset"><legend>{uiText(locale,"Dossards","Back numbers")}</legend>
    <label className="check-row"><input type="checkbox" checked={required} onChange={event=>onRequired(event.target.checked)}/><span>{uiText(locale,"Imposer les dossards fournis par l'association","Require association-issued back numbers")}</span></label>
    <label>{uiText(locale,"Frais d'un nouveau dossard pour ce bloc","New back number fee for this block")}<input type="number" min="0" step="0.01" value={fee} placeholder={uiText(locale,"Frais de l'association","Association fee")} onChange={event=>onFee(event.target.value)}/><span className="input-help">{uiText(locale,"Vide : tarif de l'association. 0 : gratuit. Aucun nouveau frais pour réutiliser un dossard déjà fourni par l'association.","Blank: association rate. 0: free. Reusing an existing association-issued number incurs no new fee.")}</span></label>
  </fieldset>;
}
