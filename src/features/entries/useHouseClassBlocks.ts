import { useEffect, useMemo, useState } from "react";
import { assessHouse, checkHouseNrha, type HouseAssessment } from '../../services/houseEligibility';
import { errorMessage } from "../../lib/display";

export function useHouseClassBlocks(org: string | undefined, show: string, horse: string, rider: string, enabled: boolean) {
  const [retry, setRetry] = useState(0);
  const key = enabled && org && show && horse && rider ? [org, show, horse, rider, retry].join(":") : "";
  const [result, setResult] = useState<{ key: string; rows: HouseAssessment[]; error: string }>({ key: "", rows: [], error: "" });
  useEffect(() => {
    if (!key) return;
    let live = true;
    void (async()=>{
      try{
        let rows=await assessHouse(org!,show,horse,rider);
        // Check the house class against its NRHA reference without creating a sanction or entry.
        for(const row of rows.filter(r=>r.nrha_pending&&!r.overridden)){
          if(!live)return;
          try{await checkHouseNrha(row.class_id,horse,rider);}catch{/* Fail closed; the assessment retains the pending reason. */}
        }
        if(rows.some(r=>r.nrha_pending))rows=await assessHouse(org!,show,horse,rider);
        if(live)setResult({key,rows,error:''});
      }catch(error){if(live)setResult({key,rows:[],error:errorMessage(error)});}
    })();
    return () => { live = false; };
  }, [key, org, show, horse, rider]);
  const rows=result.key===key?result.rows:[];
  const blocked = useMemo(() => new Set(result.key === key ? result.rows.filter(r=>!r.can_proceed).map(r=>r.class_id) : []), [result, key]);
  return { blocked, rows, loading: Boolean(key && result.key !== key), error: result.key === key ? result.error : "", retry: () => setRetry(value => value + 1) };
}
