import {handleGvlRequest} from './verification.ts';
Deno.serve((request) => handleGvlRequest(request));
