import { useCallback, useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  showToast,
  Toast,
  type Keyboard,
} from "@vicinae/api";
import { stopScan } from "./jobs";
import {
  progressMarkdown,
  readLogTail,
  readProgress,
} from "./status";

const SHORTCUT_REFRESH: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "r" };
const SHORTCUT_STOP: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "c" };

type Props = {
  path: string;
  running?: boolean;
  title: string;
};

export function LogView({ path, running = false, title }: Props) {
  const [markdown, setMarkdown] = useState(() => readLogTail(path, 120));
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    const progress = readProgress();
    const bar =
      progress && (progress.log === path || running)
        ? progressMarkdown(progress) + "\n\n"
        : "";
    setMarkdown(bar + readLogTail(path, 80));
  }, [path, running]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, running ? 800 : 2000);
    return () => clearInterval(id);
  }, [refresh, running]);

  const onStop = async () => {
    setBusy(true);
    try {
      await stopScan();
      await showToast({ style: Toast.Style.Success, title: "Scan stopping" });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not stop scan",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <List
      isLoading={busy}
      isShowingDetail
      navigationTitle={title}
      searchBarPlaceholder="Filter log…"
    >
      <List.Item
        title={running ? "Live log" : "Log"}
        subtitle={path}
        icon={{
          source: running ? Icon.Stopwatch : Icon.BlankDocument,
          tintColor: running ? Color.Blue : Color.SecondaryText,
        }}
        detail={<List.Item.Detail markdown={markdown} />}
        actions={
          <ActionPanel>
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              shortcut={SHORTCUT_REFRESH}
              onAction={refresh}
            />
            {running ? (
              <Action
                title="Stop Scan"
                icon={Icon.Stop}
                shortcut={SHORTCUT_STOP}
                onAction={() => void onStop()}
              />
            ) : null}
          </ActionPanel>
        }
      />
    </List>
  );
}
