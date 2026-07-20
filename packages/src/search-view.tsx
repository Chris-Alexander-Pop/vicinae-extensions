import { useEffect, useMemo, useRef, useState } from "react";
import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
  type Keyboard,
} from "@vicinae/api";
import { repoColor } from "./filter-picker";
import { OperationLog } from "./operation-log";
import {
  ensureSudo,
  isOperationRunning,
  startOperation,
} from "./operations";
import { listInstalledNames } from "./pacman";
import { searchPackages, type SearchHit } from "./search";

export type PackagesMode = "installed" | "search";

/** Jump to Manage (installed: update / uninstall). */
export const SHORTCUT_MANAGE: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "m",
};

/** Jump to Search & Install. */
export const SHORTCUT_SEARCH_INSTALL: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "i",
};

/** Install the selected search result (Search panel only). */
const SHORTCUT_DO_INSTALL: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "return",
};

export function ModeDropdown({
  mode,
  onChange,
}: {
  mode: PackagesMode;
  onChange: (mode: PackagesMode) => void;
}) {
  return (
    <List.Dropdown
      tooltip="Ctrl+M Manage · Ctrl+I Search & Install"
      value={mode}
      onChange={(value) => onChange(value as PackagesMode)}
    >
      <List.Dropdown.Item title="Installed" value="installed" icon={Icon.Box} />
      <List.Dropdown.Item
        title="Search & Install"
        value="search"
        icon={Icon.MagnifyingGlass}
      />
    </List.Dropdown>
  );
}

/** Mode switch actions — include on every ActionPanel so the keybinds always work. */
export function ModeSwitchActions({
  mode,
  onModeChange,
}: {
  mode: PackagesMode;
  onModeChange: (mode: PackagesMode) => void;
}) {
  return (
    <ActionPanel.Section title="Panel">
      <Action
        title="Search & Install"
        icon={Icon.MagnifyingGlass}
        shortcut={SHORTCUT_SEARCH_INSTALL}
        onAction={() => onModeChange("search")}
      />
      <Action
        title="Manage Installed"
        icon={Icon.Box}
        shortcut={SHORTCUT_MANAGE}
        onAction={() => onModeChange("installed")}
      />
    </ActionPanel.Section>
  );
}

function hitDetailMarkdown(hit: SearchHit): string {
  const lines = [
    `# ${hit.name}`,
    "",
    hit.description || "_No description_",
    "",
    `- **Version:** \`${hit.version}\``,
    `- **Repo:** ${hit.repo}`,
    `- **Source:** ${hit.source === "aur" ? "AUR" : "Official"}`,
    hit.installed
      ? "- **Status:** already installed"
      : "- **Status:** not installed",
    hit.votes != null ? `- **Votes:** ${hit.votes}` : "",
    hit.popularity != null ? `- **Popularity:** ${hit.popularity}` : "",
    hit.url ? `- **Upstream:** ${hit.url}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

type Props = {
  mode: PackagesMode;
  onModeChange: (mode: PackagesMode) => void;
};

export function SearchView({ mode, onModeChange }: Props) {
  const { push } = useNavigation();
  /** Latest text in the search bar (for empty-state copy only — never fed back as searchText). */
  const [typed, setTyped] = useState("");
  /** Query we actually hit the network with, after 250ms idle. */
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [installedNames, setInstalledNames] = useState<Set<string>>(
    () => new Set(),
  );
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshInstalled = async () => {
    try {
      setInstalledNames(await listInstalledNames());
    } catch {
      // search still works without install badges
    }
  };

  useEffect(() => {
    void refreshInstalled();
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const onSearchTextChange = (text: string) => {
    setTyped(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Abort any in-flight search immediately while typing.
    abortRef.current?.abort();
    setLoading(false);

    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setQuery("");
      setHits([]);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      setQuery(text);
    }, 250);
  };

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setError(null);
      setLoading(false);
      return;
    }

    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;
    setLoading(true);

    void searchPackages(q, installedNames, ctrl.signal)
      .then((results) => {
        if (ctrl.signal.aborted) return;
        setHits(results);
        setError(null);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setHits([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => {
      ctrl.abort();
    };
  }, [query, installedNames]);

  const sections = useMemo(() => {
    const official = hits.filter((h) => h.source === "official");
    const aur = hits.filter((h) => h.source === "aur");
    return [
      { title: "Official", items: official },
      { title: "AUR", items: aur },
    ].filter((s) => s.items.length > 0);
  }, [hits]);

  const install = async (hit: SearchHit) => {
    if (hit.installed) {
      await showToast({
        style: Toast.Style.Success,
        title: "Already installed",
        message: hit.name,
      });
      return;
    }

    if (busy || isOperationRunning()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Busy",
        message: "Another package operation is already running",
      });
      return;
    }

    const confirmed = await confirmAlert({
      title: `Install ${hit.name}?`,
      message: `This runs \`yay -Sy --noconfirm --needed ${hit.name}\` (${hit.repo}).`,
      primaryAction: {
        title: "Install",
        style: Alert.ActionStyle.Default,
      },
      dismissAction: {
        title: "Cancel",
        style: Alert.ActionStyle.Cancel,
      },
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      await showToast({
        style: Toast.Style.Animated,
        title: "Authorizing…",
        message: "Touch fingerprint or enter password if prompted",
      });

      try {
        await ensureSudo("fingerprint");
      } catch {
        await ensureSudo("password");
      }

      startOperation("install", hit.name);
      push(
        <OperationLog
          onFinished={() => {
            void refreshInstalled();
          }}
        />,
      );
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Install aborted",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const modeActions = (
    <ActionPanel>
      <ModeSwitchActions mode={mode} onModeChange={onModeChange} />
    </ActionPanel>
  );

  return (
    <List
      isLoading={loading || busy}
      filtering={false}
      onSearchTextChange={onSearchTextChange}
      searchBarPlaceholder="Search Arch + AUR… · Ctrl+M manage · Ctrl+↩ install"
      navigationTitle={
        typed.trim().length < 2
          ? "Search & Install"
          : loading
            ? `Search · …`
            : `Search · ${hits.length} results`
      }
      isShowingDetail
      searchBarAccessory={
        <ModeDropdown mode={mode} onChange={onModeChange} />
      }
      actions={modeActions}
    >
      {error ? (
        <List.EmptyView
          icon={Icon.Exclamationmark}
          title="Search failed"
          description={error}
          actions={modeActions}
        />
      ) : typed.trim().length < 2 ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="Search packages"
          description="Type at least 2 characters to search official repos and the AUR. Ctrl+M opens Manage · Ctrl+I also opens this panel from Manage."
          actions={modeActions}
        />
      ) : hits.length === 0 && !loading ? (
        <List.EmptyView
          icon={Icon.XMarkCircle}
          title="No results"
          description={`Nothing matched “${typed.trim()}”`}
          actions={modeActions}
        />
      ) : (
        sections.map((section) => (
          <List.Section
            key={section.title}
            title={section.title}
            subtitle={`${section.items.length}`}
          >
            {section.items.map((hit) => (
              <List.Item
                id={`${hit.source}:${hit.name}`}
                key={`${hit.source}:${hit.name}`}
                title={hit.name}
                subtitle={hit.description}
                keywords={[hit.name, hit.repo, hit.source]}
                icon={{
                  source: hit.installed ? Icon.CheckCircle : Icon.Download,
                  tintColor: hit.installed
                    ? Color.Green
                    : repoColor(hit.repo),
                }}
                accessories={[
                  { text: hit.version },
                  {
                    tag: {
                      value: hit.installed ? "installed" : hit.repo,
                      color: hit.installed
                        ? Color.Green
                        : repoColor(hit.repo),
                    },
                  },
                ]}
                detail={
                  <List.Item.Detail
                    markdown={hitDetailMarkdown(hit)}
                    metadata={
                      <List.Item.Detail.Metadata>
                        <List.Item.Detail.Metadata.Label
                          title="Version"
                          text={hit.version}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Repository"
                          text={hit.repo}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Status"
                          text={hit.installed ? "Installed" : "Not installed"}
                        />
                        {hit.votes != null ? (
                          <List.Item.Detail.Metadata.Label
                            title="Votes"
                            text={String(hit.votes)}
                          />
                        ) : null}
                      </List.Item.Detail.Metadata>
                    }
                  />
                }
                actions={
                  <ActionPanel>
                    <Action
                      title={
                        hit.installed
                          ? "Already installed"
                          : `Install ${hit.name}`
                      }
                      icon={hit.installed ? Icon.CheckCircle : Icon.Download}
                      shortcut={SHORTCUT_DO_INSTALL}
                      onAction={() => void install(hit)}
                    />
                    <ModeSwitchActions
                      mode={mode}
                      onModeChange={onModeChange}
                    />
                    {hit.url ? (
                      <Action.OpenInBrowser
                        title="Open Upstream"
                        url={hit.url}
                      />
                    ) : null}
                    <Action.CopyToClipboard
                      title="Copy Package Name"
                      content={hit.name}
                    />
                    <Action.CopyToClipboard
                      title="Copy Install Command"
                      content={`yay -Sy ${hit.name}`}
                    />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        ))
      )}
    </List>
  );
}
