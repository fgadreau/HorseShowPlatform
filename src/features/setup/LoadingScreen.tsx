import { RefreshCw } from "lucide-react";

export function LoadingScreen() {
  return (
    <main className="loading-screen">
      <RefreshCw className="spin" size={24} />
      <span>Loading Horse Show Platform</span>
    </main>
  );
}
