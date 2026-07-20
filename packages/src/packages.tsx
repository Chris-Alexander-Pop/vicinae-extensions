import { useState } from "react";
import { InstalledView } from "./installed-view";
import { SearchView, type PackagesMode } from "./search-view";

export default function PackagesCommand() {
  const [mode, setMode] = useState<PackagesMode>("installed");

  if (mode === "search") {
    return <SearchView mode={mode} onModeChange={setMode} />;
  }

  return <InstalledView mode={mode} onModeChange={setMode} />;
}
