import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.106.2";
import {createInvoiceEmailHandler} from "./handler.mjs";

Deno.serve(createInvoiceEmailHandler({createClient}));
