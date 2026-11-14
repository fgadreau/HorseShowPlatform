const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const oneLine = (value, fallback = '') => String(value ?? fallback).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

export function invoiceEmail(document, locale = 'fr') {
  if (!document || document.kind !== 'invoice' || !['fr', 'en'].includes(locale)) throw Error('BILLING_EMAIL_INVALID');
  const snapshot = document.snapshot ?? {};
  const payer = snapshot.payer ?? {};
  const context = snapshot.context ?? {};
  const fr = locale === 'fr';
  const number = oneLine(document.number, snapshot.account_number || 'HSP');
  const showName = oneLine(fr ? context.name_fr : context.name_en, context.name_fr || context.name_en || 'Horse Show Platform');
  const payerName = oneLine(payer.billing_name || [payer.first_name, payer.middle_name, payer.last_name].filter(Boolean).join(' ') || payer.company_name, fr ? 'Bonjour' : 'Hello');
  const subject = oneLine(fr ? `Facture HSP ${number} — ${showName}` : `HSP invoice ${number} — ${showName}`);
  const filename = `${fr ? 'Facture' : 'Invoice'}-HSP-${number}`.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 120) + '.pdf';
  const intro = fr
    ? `Veuillez trouver ci-joint votre facture ${number} pour ${showName}.`
    : `Please find attached your invoice ${number} for ${showName}.`;
  const reply = fr
    ? 'Pour toute question, répondez simplement à ce courriel; votre réponse sera acheminée au secrétariat.'
    : 'If you have any questions, simply reply to this email; your response will be sent to the show office.';
  const note = fr
    ? 'Cette facture consolidée peut regrouper les frais de plusieurs fournisseurs. Chaque fournisseur facture et encaisse directement les montants qui lui sont attribués.'
    : 'This consolidated invoice may include charges from multiple suppliers. Each supplier bills and collects the amounts allocated to it directly.';
  const greeting = fr ? `Bonjour ${payerName},` : `Hello ${payerName},`;
  const text = `${greeting}\n\n${intro}\n\n${note}\n\n${reply}\n\nHorse Show Platform`;
  const html = `<!doctype html><html lang="${locale}" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#f6f3f5;color:#28232a;font-family:Arial,sans-serif"><main style="max-width:620px;margin:0 auto;padding:32px 20px"><section style="background:#ffffff;border:1px solid #ded6dc;border-radius:10px;padding:28px"><p style="margin:0 0 20px;color:#653c59;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Horse Show Platform</p><h1 style="margin:0 0 24px;color:#28232a;font-size:24px;line-height:1.25">${escapeHtml(fr ? 'Votre facture est jointe' : 'Your invoice is attached')}</h1><p style="margin:0 0 16px;line-height:1.6">${escapeHtml(greeting)}</p><p style="margin:0 0 16px;line-height:1.6">${escapeHtml(intro)}</p><p style="margin:0 0 16px;padding:14px;background:#f6f3f5;border-left:3px solid #653c59;line-height:1.55">${escapeHtml(note)}</p><p style="margin:0 0 22px;line-height:1.6">${escapeHtml(reply)}</p><p style="margin:0;color:#653c59;font-weight:700">Horse Show Platform</p></section></main></body></html>`;
  return {subject, filename, text, html};
}
