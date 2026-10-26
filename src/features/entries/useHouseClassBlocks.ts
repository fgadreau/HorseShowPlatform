import { useEffect, useMemo, useState } from "react";
import { billingRpc } from "../../services/billingFolio";
import { errorMessage } from "../../lib/display";

export function useHouseClassBlocks(org: string | undefined, show: string, horse: string, rider: string, enabled: boolean) {
  const [retry, setRetry] = useState(0);
  const key = enabled && org && show && horse && rider ? [org, show, horse, rider, retry].join(":") : "";
  const [result, setResult] = useState<{ key: string; ids: string[]; error: string }>({ key: "", ids: [], error: "" });
  useEffect(() => {
    if (!key) return;
    let live = true;
    void billingRpc("house_class_entry_blocks", { p_org: org, p_show: show, p_horse: horse, p_rider: rider })
      .then(rows => { if (live) setResult({ key, ids: rows.map((row: { class_id: string }) => row.class_id), error: "" }); })
      .catch(error => { if (live) setResult({ key, ids: [], error: errorMessage(error) }); });
    return () => { live = false; };
  }, [key, org, show, horse, rider]);
  const blocked = useMemo(() => new Set(result.key === key ? result.ids : []), [result, key]);
  return { blocked, loading: Boolean(key && result.key !== key), error: result.key === key ? result.error : "", retry: () => setRetry(value => value + 1) };
}
