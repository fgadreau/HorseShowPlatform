import {useEffect,useState} from 'react';
import {vetCapabilities,vetLocalServices} from '../../services/vetServices';
export function useVetServices(){
 const [state,setState]=useState({ready:vetLocalServices,mail:vetLocalServices,omvq:vetLocalServices,missing:[] as string[]});
 useEffect(()=>{let active=true;void vetCapabilities().then(v=>{if(active)setState(v);});return()=>{active=false;};},[]);
 return state;
}
