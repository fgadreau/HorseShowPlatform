import {createServer} from 'vite';
const host=process.env.CODESPACE_NAME+'-5174.'+process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
const server=await createServer({server:{host:'0.0.0.0',port:5174,strictPort:true,allowedHosts:[host],proxy:{'/__local-onboarding':{target:'http://127.0.0.1:54333',rewrite:p=>p.replace(/^\/__local-onboarding/,''),configure:proxy=>proxy.on('proxyReq',(out,req)=>{if(req.headers.origin&&new URL(req.headers.origin).host===req.headers.host)out.setHeader('Origin','http://127.0.0.1:5174');})}}}});await server.listen();console.log('HSP onboarding preview on 5174');
