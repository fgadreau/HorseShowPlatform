import {useEffect,useMemo,useState} from 'react';
import {requireSupabase} from '../../lib/supabase';
import {errorMessage} from '../../lib/display';
import type {Horse} from '../../types/domain';
export function useStabledHorses(showId:string,horses:Horse[]){
 const [revision,setRevision]=useState(0);
 const key=`${showId}:${revision}`;
 const [result,setResult]=useState<{key:string;ids:string[];error:string}>({key:'',ids:[],error:''});
 useEffect(()=>{if(!showId)return;let live=true;void(async()=>{try{const {data,error}=await requireSupabase().rpc('entry_stabled_horses',{p_show:showId});if(error)throw error;if(live)setResult({key,ids:(data??[]).map((r:{horse_id:string})=>r.horse_id),error:''});}catch(error){if(live)setResult({key,ids:[],error:errorMessage(error)});}})();return()=>{live=false;};},[showId,key]);
 const ids=useMemo(()=>new Set(result.key===key?result.ids:[]),[result,key]);
 return {horses:useMemo(()=>horses.filter(h=>ids.has(h.id)),[horses,ids]),loading:Boolean(showId&&result.key!==key),error:result.key===key?result.error:'',refresh:()=>setRevision(n=>n+1)};
}
