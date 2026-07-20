import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  useNavigation,
} from "@vicinae/api";
import {
  isRepoFilter,
  type PackageFilter,
} from "./pacman";

export const STATUS_FILTERS: { value: PackageFilter; title: string; subtitle: string }[] =
  [
    {
      value: "all",
      title: "All packages",
      subtitle: "Show every installed package",
    },
    {
      value: "updatable",
      title: "Updatable",
      subtitle: "Only packages with a newer version available",
    },
    {
      value: "explicit",
      title: "Explicit",
      subtitle: "Installed directly (not as a dependency)",
    },
    {
      value: "dependency",
      title: "As dependency",
      subtitle: "Pulled in by another package",
    },
    {
      value: "orphans",
      title: "Orphans",
      subtitle: "Dependencies no longer required",
    },
  ];

export function repoColor(repo: string): Color {
  switch (repo) {
    case "core":
      return Color.Red;
    case "extra":
      return Color.Blue;
    case "multilib":
      return Color.Purple;
    case "AUR":
      return Color.Yellow;
    default:
      return Color.SecondaryText;
  }
}

export function filterLabel(filter: PackageFilter): string {
  if (isRepoFilter(filter)) return filter.slice("repo:".length);
  switch (filter) {
    case "updatable":
      return "Updatable";
    case "explicit":
      return "Explicit";
    case "dependency":
      return "As dependency";
    case "orphans":
      return "Orphans";
    default:
      return "All";
  }
}

type Props = {
  current: PackageFilter;
  repos: string[];
  onSelect: (filter: PackageFilter) => void;
};

export function FilterPicker({ current, repos, onSelect }: Props) {
  const { pop } = useNavigation();

  const choose = (value: PackageFilter) => {
    onSelect(value);
    pop();
  };

  return (
    <List
      navigationTitle="Filter packages"
      searchBarPlaceholder="Search filters…"
    >
      <List.Section title="Status">
        {STATUS_FILTERS.map((f) => {
          const active = current === f.value;
          return (
            <List.Item
              key={f.value}
              id={f.value}
              title={f.title}
              subtitle={f.subtitle}
              icon={
                active
                  ? { source: Icon.Checkmark, tintColor: Color.Green }
                  : Icon.Filter
              }
              accessories={
                active
                  ? [{ tag: { value: "active", color: Color.Green } }]
                  : undefined
              }
              actions={
                <ActionPanel>
                  <Action
                    title={`Filter: ${f.title}`}
                    icon={Icon.Filter}
                    onAction={() => choose(f.value)}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>

      <List.Section title="Repository">
        {repos.map((repo) => {
          const value = `repo:${repo}` as PackageFilter;
          const active = current === value;
          return (
            <List.Item
              key={value}
              id={value}
              title={repo}
              subtitle={`Only packages from ${repo}`}
              icon={
                active
                  ? { source: Icon.Checkmark, tintColor: Color.Green }
                  : { source: Icon.Box, tintColor: repoColor(repo) }
              }
              accessories={
                active
                  ? [{ tag: { value: "active", color: Color.Green } }]
                  : [{ tag: { value: repo, color: repoColor(repo) } }]
              }
              actions={
                <ActionPanel>
                  <Action
                    title={`Filter: ${repo}`}
                    icon={Icon.Box}
                    onAction={() => choose(value)}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}

/** Quick picks for ActionPanel.Submenu (status + repos). */
export function FilterSubmenu({
  current,
  repos,
  onSelect,
}: {
  current: PackageFilter;
  repos: string[];
  onSelect: (filter: PackageFilter) => void;
}) {
  return (
    <ActionPanel.Submenu title="Filter" icon={Icon.Filter}>
      {STATUS_FILTERS.map((f) => (
        <Action
          key={f.value}
          title={current === f.value ? `✓ ${f.title}` : f.title}
          icon={Icon.Filter}
          onAction={() => onSelect(f.value)}
        />
      ))}
      {repos.map((repo) => {
        const value = `repo:${repo}` as PackageFilter;
        return (
          <Action
            key={value}
            title={current === value ? `✓ ${repo}` : repo}
            icon={{ source: Icon.Box, tintColor: repoColor(repo) }}
            onAction={() => onSelect(value)}
          />
        );
      })}
    </ActionPanel.Submenu>
  );
}
