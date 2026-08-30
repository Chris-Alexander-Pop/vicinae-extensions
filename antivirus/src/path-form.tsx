import { useState } from "react";
import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { startScan } from "./jobs";

function normalizePickedPath(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  if (raw.startsWith("file://")) {
    try {
      return decodeURIComponent(raw.slice("file://".length));
    } catch {
      return raw.slice("file://".length);
    }
  }
  return raw;
}

type Props = {
  onStarted: () => void;
};

type FormValues = {
  picker?: string[];
  path?: string;
};

export function PathScanForm({ onStarted }: Props) {
  const { pop } = useNavigation();
  const [path, setPath] = useState("");

  const onSubmit = async (values: FormValues) => {
    const picked =
      normalizePickedPath(values.picker?.[0] || "") ||
      normalizePickedPath(values.path || "") ||
      path;
    if (!picked) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Pick a file or folder",
      });
      return;
    }
    try {
      await startScan("path", [picked]);
      await showToast({ style: Toast.Style.Success, title: "Path scan started" });
      onStarted();
      pop();
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Scan failed to start",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <Form
      navigationTitle="Scan path"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Scan"
            icon={Icon.MagnifyingGlass}
            onSubmit={(v) => void onSubmit(v as FormValues)}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Scan one file or folder with the same excludes as a home scan (node_modules, Android SDK, caches, …)." />
      <Form.FilePicker
        id="picker"
        title="File or folder"
        allowMultipleSelection={false}
        canChooseDirectories
        canChooseFiles
        value={path ? [path] : []}
        onChange={(files) => {
          setPath(normalizePickedPath(files[0] || ""));
        }}
      />
      <Form.TextField
        id="path"
        title="Or path"
        placeholder="$HOME/Downloads"
        value={path}
        onChange={setPath}
      />
    </Form>
  );
}
