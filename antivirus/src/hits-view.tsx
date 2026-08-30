import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  showToast,
  Toast,
  confirmAlert,
  Alert,
} from "@vicinae/api";
import { ignoreHit, isIgnored, parentDir, quarantineFile, type Hit } from "./history";

type Props = {
  hits: Hit[];
  title?: string;
  onChange?: () => void;
};

export function HitsView({ hits, title = "Hits", onChange }: Props) {
  const visible = hits.filter((h) => !isIgnored(h));
  const hidden = hits.length - visible.length;

  const quarantine = async (hit: Hit) => {
    const ok = await confirmAlert({
      title: "Quarantine this file?",
      message: hit.path,
      primaryAction: { title: "Quarantine", style: Alert.ActionStyle.Destructive },
    });
    if (!ok) return;
    try {
      const dest = quarantineFile(hit.path);
      await showToast({
        style: Toast.Style.Success,
        title: "Quarantined",
        message: dest,
      });
      onChange?.();
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Quarantine failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const ignore = (hit: Hit, by: "path" | "signature") => {
    ignoreHit(hit, by);
    void showToast({
      style: Toast.Style.Success,
      title: by === "path" ? "Ignored this path" : "Ignored this signature",
    });
    onChange?.();
  };

  if (!visible.length) {
    return (
      <List navigationTitle={title}>
        <List.EmptyView
          icon={Icon.Checkmark}
          title={hits.length ? "All hits ignored" : "No infected files"}
          description={hidden ? `${hidden} ignored` : "Nothing to review"}
        />
      </List>
    );
  }

  return (
    <List
      navigationTitle={title}
      searchBarPlaceholder="Filter hits…"
      isShowingDetail
    >
      {visible.map((hit, i) => (
        <List.Item
          key={`${hit.path}:${hit.signature}:${i}`}
          title={hit.path.split("/").pop() || hit.path}
          subtitle={hit.signature}
          icon={{ source: Icon.Warning, tintColor: Color.Red }}
          keywords={[hit.path, hit.signature]}
          detail={
            <List.Item.Detail
              markdown={`# ${hit.signature}\n\n\`${hit.path}\``}
            />
          }
          actions={
            <ActionPanel>
              <Action.ShowInFinder path={parentDir(hit.path)} title="Open Folder" />
              <Action.CopyToClipboard content={hit.path} title="Copy Path" />
              <Action.CopyToClipboard content={hit.signature} title="Copy Signature" />
              <Action
                title="Quarantine File"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={() => void quarantine(hit)}
              />
              <Action
                title="Ignore This Path"
                icon={Icon.EyeDisabled}
                onAction={() => ignore(hit, "path")}
              />
              <Action
                title="Ignore This Signature"
                icon={Icon.EyeDisabled}
                onAction={() => ignore(hit, "signature")}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
