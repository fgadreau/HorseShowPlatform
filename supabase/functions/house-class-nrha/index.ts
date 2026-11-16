import {createClient} from 'npm:@supabase/supabase-js@2.106.2';
import {createHouseNrhaHandler} from './handler.mjs';
Deno.serve(createHouseNrhaHandler({createClient,env:key=>Deno.env.get(key)}));
