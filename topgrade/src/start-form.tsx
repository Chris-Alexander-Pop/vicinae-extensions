import { useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import {
  authenticateAndStart,
  spawnPasswordPromptDetached,
  startTopgradeService,
  sudoCached,
  waitForPasswordPrompt,
} from "./runner";

type Props = {
  onStarted: () => void;
};

export function StartForm({ onStarted }: Props) {
  const [loading, setLoading] = useState(false);

  const beginRun = async (mode: "fingerprint" | "password") => {
    setLoading(true);
    try {
      if (mode === "password") {
        await showToast({
          style: Toast.Style.Animated,
          title: "Password…",
          message: "Enter your password in the Authorize Topgrade dialog",
        });

        // Keep Vicinae open — dialog floats on top.
        const promptPid = spawnPasswordPromptDetached();
        const warmed = await waitForPasswordPrompt(promptPid);
        if (!warmed) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Cancelled",
            message: "Password dialog closed without authorizing",
          });
          return;
        }

        if (!(await sudoCached())) {
          throw new Error(
            "Password dialog finished but sudo is not authorized. Try again.",
          );
        }

        await startTopgradeService();
      } else {
        await showToast({
          style: Toast.Style.Animated,
          title: "Waiting for fingerprint…",
          message: "Touch the fingerprint reader — Vicinae stays open",
        });
        await authenticateAndStart("fingerprint");
      }

      await showToast({
        style: Toast.Style.Success,
        title: "Topgrade started",
        message: "Sudo OK — tracking progress",
      });
      onStarted();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const incorrect = /incorrect password/i.test(message);
      await showToast({
        style: Toast.Style.Failure,
        title: incorrect ? "Incorrect password" : "Could not start Topgrade",
        message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <List
      isLoading={loading}
      navigationTitle="Run Topgrade"
      searchBarPlaceholder="Choose how to authorize sudo…"
    >
      <List.Section title="Authorize & start">
        <List.Item
          title="Start with Fingerprint"
          subtitle="Press Enter, then touch the reader — launcher stays open"
          icon={{ source: Icon.Fingerprint, tintColor: Color.Blue }}
          actions={
            <ActionPanel>
              <Action
                title="Start with Fingerprint"
                icon={Icon.Fingerprint}
                onAction={() => void beginRun("fingerprint")}
              />
              <Action
                title="Start with Password…"
                icon={Icon.Key}
                shortcut={{ modifiers: ["shift"], key: "return" }}
                onAction={() => void beginRun("password")}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Start with Password…"
          subtitle="Press Enter · dialog opens over Vicinae"
          icon={{ source: Icon.Key, tintColor: Color.Yellow }}
          actions={
            <ActionPanel>
              <Action
                title="Start with Password…"
                icon={Icon.Key}
                onAction={() => void beginRun("password")}
              />
              <Action
                title="Start with Fingerprint"
                icon={Icon.Fingerprint}
                shortcut={{ modifiers: ["shift"], key: "return" }}
                onAction={() => void beginRun("fingerprint")}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
