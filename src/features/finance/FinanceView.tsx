import { useEffect, useState } from "react";
import { LegacyFinanceView } from "./LegacyFinanceView";
import { AssociationFinanceView } from "./AssociationFinanceView";
import { financeRoute } from "./navigation";

export type FinanceViewProps = Parameters<typeof LegacyFinanceView>[0];

export function FinanceView(props: FinanceViewProps) {
  const [url, setUrl] = useState(() => window.location.href);
  useEffect(() => {
    const changed = () => setUrl(window.location.href);
    window.addEventListener("popstate", changed);
    return () => window.removeEventListener("popstate", changed);
  }, []);
  // Keep existing payment, closing and immutable-document workflows intact.
  return props.personal || financeRoute(new URL(url).pathname)?.folio
    ? <LegacyFinanceView {...props} />
    : <AssociationFinanceView {...props} />;
}
