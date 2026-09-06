/** Approved artwork, served unchanged from public/branding. */
export function Brand({ symbol = false }: { symbol?: boolean }) {
  return <img className={symbol ? "hsp-brand hsp-brand-symbol" : "hsp-brand"}
    src={`/branding/hsp-${symbol ? "symbole" : "logo"}-aubergine.svg`}
    alt="HSP — Horse Show Platform" width={symbol ? 48 : 172} height={48} />;
}
