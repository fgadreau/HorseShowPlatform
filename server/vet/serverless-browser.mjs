import chromium from '@sparticuz/chromium';
import {chromium as playwright} from 'playwright-core';
export const serverlessBrowser={launch:async(options={})=>playwright.launch({...options,args:chromium.args.filter(a=>a!=='--single-process'),executablePath:await chromium.executablePath(),headless:true})};
