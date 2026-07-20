import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  getPreferenceValues,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
  type Keyboard,
} from "@vicinae/api";
import { criticalReason, isCriticalPackage, parseExtraCritical } from "./critical";
import { FilterPicker, FilterSubmenu, filterLabel, repoColor } from "./filter-picker";
import { ModeDropdown, ModeSwitchActions, type PackagesMode } from "./search-view";
import { OperationLog } from "./operation-log";
import {
  ensureSudo,
  isOperationRunning,
  startOperation,
  type OpKind,
} from "./operations";
import {
  filterPackages,
  groupByRepo,
  listInstalledPackages,
  sortRepos,
  type InstalledPackage,
  type PackageFilter,
} from "./pacman";

type Preferences = {
  extraCriticalPackages?: string;
};

const SHORTCUT_REFRESH: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "r" };
const SHORTCUT_UPDATE: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "u" };
const SHORTCUT_FILTER: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "f" };
const SHORTCUT_UNINSTALL: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "backspace",
};

function packageDetailMarkdown(
  pkg: InstalledPackage,
  extraCritical: string[] = [],
): string {
  const lines = [
    `# ${pkg.name}`,
    "",
    pkg.description || "_No description_",
    "",
    `- **Version:** \`${pkg.version}\``,
    `- **Repo:** ${pkg.repo}`,
    `- **Reason:** ${pkg.reason === "explicit" ? "Explicitly installed" : "Installed as a dependency"}`,
    pkg.installedSize ? `- **Installed size:** ${pkg.installedSize}` : "",
    pkg.orphan ? `- **Orphan:** yes` : "",
    pkg.availableVersion
      ? `- **Update available:** \`${pkg.version}\` → \`${pkg.availableVersion}\``
      : "- **Update available:** no (installed version is current)",
    pkg.critical
      ? `- **Protected:** ${criticalReason(pkg.name, extraCritical) ?? "critical system package"}`
      : "",
    "",
  ];

  if (pkg.depends.length) {
    lines.push("## Depends on", "", pkg.depends.slice(0, 40).join(", "));
    if (pkg.depends.length > 40) {
      lines.push(`_…and ${pkg.depends.length - 40} more_`);
    }
    lines.push("");
  }
  if (pkg.requiredBy.length) {
    lines.push("## Required by", "", pkg.requiredBy.slice(0, 40).join(", "));
    if (pkg.requiredBy.length > 40) {
      lines.push(`_…and ${pkg.requiredBy.length - 40} more_`);
    }
  }
  return lines.filter((l) => l !== "").join("\n");
}

function PackageActions({
  pkg,
  filter,
  repos,
  onFilter,
  onModeChange,
  onRefresh,
  onRun,
}: {
  pkg: InstalledPackage;
  filter: PackageFilter;
  repos: string[];
  onFilter: (filter: PackageFilter) => void;
  onModeChange: (mode: PackagesMode) => void;
  onRefresh: () => void;
  onRun: (kind: OpKind, name: string) => Promise<void>;
}) {
  return (
    <ActionPanel>
      <ActionPanel.Section title="Package">
        <Action
          title={
            pkg.availableVersion
              ? `Update ${pkg.name}`
              : "Update (already up to date)"
          }
          icon={Icon.ArrowClockwise}
          shortcut={SHORTCUT_UPDATE}
          onAction={() => {
            if (!pkg.availableVersion) {
              void showToast({
                style: Toast.Style.Success,
                title: "Already up to date",
                message: `${pkg.name} ${pkg.version}`,
              });
              return;
            }
            void onRun("update", pkg.name);
          }}
        />
        {pkg.critical ? (
          <Action
            title="Protected — cannot uninstall"
            icon={Icon.Lock}
            style={Action.Style.Destructive}
            onAction={async () => {
              await showToast({
                style: Toast.Style.Failure,
                title: "Protected package",
                message:
                  criticalReason(pkg.name) ??
                  "This package cannot be uninstalled from Vicinae",
              });
            }}
          />
        ) : (
          <Action
            title={`Uninstall ${pkg.name}`}
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            shortcut={SHORTCUT_UNINSTALL}
            onAction={() => void onRun("uninstall", pkg.name)}
          />
        )}
      </ActionPanel.Section>

      <ActionPanel.Section title="Filter">
        <Action.Push
          title="Open Filter"
          icon={Icon.Filter}
          shortcut={SHORTCUT_FILTER}
          target={
            <FilterPicker
              current={filter}
              repos={repos}
              onSelect={onFilter}
            />
          }
        />
        <FilterSubmenu current={filter} repos={repos} onSelect={onFilter} />
      </ActionPanel.Section>

      <ModeSwitchActions mode="installed" onModeChange={onModeChange} />

      <ActionPanel.Section title="Misc">
        <Action
          title="Refresh"
          icon={Icon.ArrowClockwise}
          shortcut={SHORTCUT_REFRESH}
          onAction={onRefresh}
        />
        <Action.CopyToClipboard title="Copy Package Name" content={pkg.name} />
        <Action.CopyToClipboard
          title="Copy Uninstall Command"
          content={`yay -Rns ${pkg.name}`}
        />
        <Action.CopyToClipboard
          title="Copy Update Command"
          content={`yay -S ${pkg.name}`}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}

function renderPackageItem(
  pkg: InstalledPackage,
  extraCritical: string[],
  filter: PackageFilter,
  repos: string[],
  onFilter: (filter: PackageFilter) => void,
  onModeChange: (mode: PackagesMode) => void,
  onRefresh: () => void,
  onRun: (kind: OpKind, name: string) => Promise<void>,
) {
  const accessories: List.Item.Accessory[] = [
    {
      tag: {
        value: pkg.repo,
        color: repoColor(pkg.repo),
      },
    },
  ];
  if (pkg.availableVersion) {
    accessories.unshift({
      tag: { value: "update", color: Color.Green },
    });
  }
  if (pkg.orphan) {
    accessories.push({
      tag: { value: "orphan", color: Color.Orange },
    });
  }
  if (pkg.critical) {
    accessories.push({
      icon: Icon.Lock,
      tooltip: criticalReason(pkg.name, extraCritical) ?? "Protected",
    });
  }

  return (
    <List.Item
      id={pkg.name}
      key={pkg.name}
      title={pkg.name}
      subtitle={pkg.description}
      keywords={[
        pkg.name,
        pkg.repo,
        pkg.reason,
        pkg.orphan ? "orphan" : "",
        pkg.availableVersion ? "update" : "",
      ].filter(Boolean)}
      accessories={[
        {
          text: pkg.availableVersion
            ? `${pkg.version} → ${pkg.availableVersion}`
            : pkg.version,
        },
        ...accessories,
      ]}
      icon={
        pkg.critical
          ? { source: Icon.Lock, tintColor: Color.SecondaryText }
          : pkg.availableVersion
            ? {
                source: Icon.ArrowClockwise,
                tintColor: Color.Green,
              }
            : {
                source: Icon.Box,
                tintColor: repoColor(pkg.repo),
              }
      }
      detail={
        <List.Item.Detail
          markdown={packageDetailMarkdown(pkg, extraCritical)}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label
                title="Version"
                text={pkg.version}
              />
              {pkg.availableVersion ? (
                <List.Item.Detail.Metadata.Label
                  title="Available"
                  text={pkg.availableVersion}
                />
              ) : (
                <List.Item.Detail.Metadata.Label
                  title="Available"
                  text="Up to date"
                />
              )}
              <List.Item.Detail.Metadata.Label
                title="Repository"
                text={pkg.repo}
              />
              <List.Item.Detail.Metadata.Label
                title="Install reason"
                text={
                  pkg.reason === "explicit" ? "Explicit" : "Dependency"
                }
              />
              {pkg.installedSize ? (
                <List.Item.Detail.Metadata.Label
                  title="Size"
                  text={pkg.installedSize}
                />
              ) : null}
              {pkg.critical ? (
                <List.Item.Detail.Metadata.Label
                  title="Protected"
                  text={criticalReason(pkg.name, extraCritical) ?? "Yes"}
                  icon={Icon.Lock}
                />
              ) : null}
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <PackageActions
          pkg={pkg}
          filter={filter}
          repos={repos}
          onFilter={onFilter}
          onModeChange={onModeChange}
          onRefresh={onRefresh}
          onRun={onRun}
        />
      }
    />
  );
}

export function InstalledView({
  mode,
  onModeChange,
}: {
  mode: PackagesMode;
  onModeChange: (mode: PackagesMode) => void;
}) {
  const prefs = getPreferenceValues<Preferences>();
  const extraCritical = useMemo(
    () => parseExtraCritical(prefs.extraCriticalPackages),
    [prefs.extraCriticalPackages],
  );
  const { push } = useNavigation();

  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<InstalledPackage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PackageFilter>("all");
  const [busy, setBusy] = useState(false);

  const applyFilter = useCallback(async (next: PackageFilter) => {
    setFilter(next);
    await showToast({
      style: Toast.Style.Success,
      title: `Filter: ${filterLabel(next)}`,
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listInstalledPackages((name) =>
        isCriticalPackage(name, extraCritical),
      );
      setPackages(list);
      setError(null);
      const updates = list.filter((p) => p.availableVersion).length;
      if (updates > 0) {
        await showToast({
          style: Toast.Style.Success,
          title: `${updates} update${updates === 1 ? "" : "s"} available`,
          message: "Ctrl+F opens filter · or pick Updatable",
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to list packages";
      setError(message);
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not list packages",
        message,
      });
    } finally {
      setLoading(false);
    }
  }, [extraCritical]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const repos = useMemo(
    () => sortRepos([...new Set(packages.map((p) => p.repo))]),
    [packages],
  );

  const filtered = useMemo(
    () => filterPackages(packages, filter),
    [packages, filter],
  );

  const updatable = useMemo(
    () => packages.filter((p) => !!p.availableVersion),
    [packages],
  );

  const sections = useMemo(() => {
    if (filter === "all" && updatable.length > 0) {
      const updatableNames = new Set(updatable.map((p) => p.name));
      const rest = filtered.filter((p) => !updatableNames.has(p.name));
      const byRepo = groupByRepo(rest);
      return [
        { repo: "Updates available", items: updatable, pinned: true as const },
        ...sortRepos([...byRepo.keys()]).map((repo) => ({
          repo,
          items: byRepo.get(repo) ?? [],
          pinned: false as const,
        })),
      ];
    }

    const grouped = groupByRepo(filtered);
    return sortRepos([...grouped.keys()]).map((repo) => ({
      repo,
      items: grouped.get(repo) ?? [],
      pinned: false as const,
    }));
  }, [filtered, filter, updatable]);

  const runOp = async (kind: OpKind, name: string) => {
    if (busy || isOperationRunning()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Busy",
        message: "Another package operation is already running",
      });
      return;
    }

    if (kind === "uninstall") {
      const pkg = packages.find((p) => p.name === name);
      if (pkg?.critical || isCriticalPackage(name, extraCritical)) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Protected package",
          message: criticalReason(name, extraCritical) ?? "Cannot uninstall",
        });
        return;
      }

      const confirmed = await confirmAlert({
        title: `Uninstall ${name}?`,
        message: `This runs \`yay -Rns --noconfirm ${name}\` (remove package, deps no longer needed, and config files).`,
        primaryAction: {
          title: "Uninstall",
          style: Alert.ActionStyle.Destructive,
        },
        dismissAction: {
          title: "Cancel",
          style: Alert.ActionStyle.Cancel,
        },
      });
      if (!confirmed) return;
    }

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

      startOperation(kind, name);
      push(
        <OperationLog
          onFinished={() => {
            void refresh();
          }}
        />,
      );
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: kind === "uninstall" ? "Uninstall aborted" : "Update aborted",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const filterActions = (
    <ActionPanel>
      <ModeSwitchActions mode={mode} onModeChange={onModeChange} />
      <Action.Push
        title="Open Filter"
        icon={Icon.Filter}
        shortcut={SHORTCUT_FILTER}
        target={
          <FilterPicker
            current={filter}
            repos={repos}
            onSelect={(f) => void applyFilter(f)}
          />
        }
      />
      <FilterSubmenu
        current={filter}
        repos={repos}
        onSelect={(f) => void applyFilter(f)}
      />
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={SHORTCUT_REFRESH}
        onAction={() => void refresh()}
      />
    </ActionPanel>
  );

  if (error && packages.length === 0) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Exclamationmark}
          title="Can't list packages"
          description={`${error}\n\nNeed pacman, yay, and optionally checkupdates (pacman-contrib).`}
          actions={
            <ActionPanel>
              <Action
                title="Retry"
                icon={Icon.ArrowClockwise}
                onAction={() => void refresh()}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={loading || busy}
      searchBarPlaceholder="Search installed… · Ctrl+I install · Ctrl+F filter · Ctrl+M manage"
      navigationTitle={
        loading
          ? "Packages"
          : updatable.length > 0
            ? `${filterLabel(filter)} · ${filtered.length} · ${updatable.length} updates`
            : `${filterLabel(filter)} · ${filtered.length} · up to date`
      }
      isShowingDetail
      searchBarAccessory={
        <ModeDropdown mode={mode} onChange={onModeChange} />
      }
      actions={filterActions}
    >
      {filtered.length === 0 ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title={
            filter === "updatable"
              ? "All packages up to date"
              : "No packages"
          }
          description={
            filter === "all"
              ? "No installed packages found"
              : `No packages match “${filterLabel(filter)}” — Ctrl+F to change filter`
          }
          actions={filterActions}
        />
      ) : (
        sections.map(({ repo, items, pinned }) => (
          <List.Section
            key={pinned ? "updates-pinned" : repo}
            title={repo}
            subtitle={`${items.length}`}
          >
            {items.map((pkg) =>
              renderPackageItem(
                pkg,
                extraCritical,
                filter,
                repos,
                (f) => void applyFilter(f),
                onModeChange,
                () => void refresh(),
                runOp,
              ),
            )}
          </List.Section>
        ))
      )}
    </List>
  );
}
