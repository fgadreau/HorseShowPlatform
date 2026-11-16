import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/theme.css';
import '../../src/styles.css';
import '../../src/features/finance/finance.css';
import {AccountDetail} from '../../src/features/finance/AccountDetail';
createRoot(document.getElementById('root')!).render(<main className="finance"><AccountDetail folio="folio-test" identity="credit-test-user" locale={location.search.includes('english')?'en':'fr'} personal={location.search.includes('personal')}/></main>);
