import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Action,
  ActionPanel,
  confirmAlert,
  Form,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import {
  blankShade,
  draftFromWindow,
  formatNum,
  formatVec,
  normalizeDarkWindow,
  parseColor,
  shadeForWindow,
  shadeSummary,
  shaderLabel,
  type DarkWindowConfig,
  type DarkWindowShader,
  type Vec3,
} from "./darkwindow";
import { listWindows } from "./darkwindow-runtime";
import { readPersistState } from "./persist";

export type ShadeHandlers = {
  configs: DarkWindowConfig[];
  onSave: (config: DarkWindowConfig) => Promise<boolean>;
  onDelete: (config: DarkWindowConfig) => Promise<boolean>;
};

function savedNow(): DarkWindowConfig[] {
  return Object.values(readPersistState().darkWindows);
}

export function DarkWindowRows({
  handlers,
  extraActions,
}: {
  handlers: ShadeHandlers;
  extraActions: ReactNode;
}) {
  const count = handlers.configs.length;
  return (
    <>
      <List.Item
        title="Window shades"
        subtitle="Pick an open window and save a shader for it"
        icon={Icon.AppWindow}
        keywords={["shade", "shader", "window", "invert", "tint", "chromakey", "darkwindow"]}
        actions={
          <ActionPanel>
            <Action.Push
              title="Choose a window"
              icon={Icon.AppWindow}
              target={<DarkWindowWindows handlers={handlers} />}
            />
            <Action.Push
              title="Edit saved shades"
              icon={Icon.Brush}
              target={<DarkWindowSaved handlers={handlers} />}
            />
            {extraActions}
          </ActionPanel>
        }
      />
      <List.Item
        title="Saved shades"
        subtitle={
          count === 0
            ? "None yet. Shades you save stay in this list"
            : count === 1
              ? "1 saved shade"
              : `${count} saved shades`
        }
        icon={Icon.Brush}
        accessories={count > 0 ? [{ text: String(count) }] : undefined}
        keywords={["shade", "saved", "edit", "invert", "tint", "chromakey"]}
        actions={
          <ActionPanel>
            <Action.Push
              title="Edit saved shades"
              icon={Icon.Brush}
              target={<DarkWindowSaved handlers={handlers} />}
            />
            <Action.Push
              title="Choose a window"
              icon={Icon.AppWindow}
              target={<DarkWindowWindows handlers={handlers} />}
            />
            {extraActions}
          </ActionPanel>
        }
      />
    </>
  );
}

function DarkWindowWindows({ handlers }: { handlers: ShadeHandlers }) {
  const [windows, setWindows] = useState<Awaited<ReturnType<typeof listWindows>> | null>(null);
  const [configs, setConfigs] = useState(handlers.configs);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setWindows(await listWindows());
      setConfigs(savedNow());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const afterChange = () => setConfigs(savedNow());

  return (
    <List
      isLoading={loading}
      navigationTitle="Window shades"
      searchBarPlaceholder="Filter open windows..."
    >
      {error ? (
        <List.EmptyView
          icon={Icon.Exclamationmark}
          title="Couldn't list windows"
          description={error}
        />
      ) : null}
      {!error && windows && windows.length === 0 ? (
        <List.EmptyView
          icon={Icon.AppWindow}
          title="No open windows"
          description="Open one, then refresh this list."
        />
      ) : null}
      {windows && windows.length > 0 ? (
        <List.Section title="Open windows" subtitle="A class shade matches every window of that app">
          {windows.map((win) => {
            const match = shadeForWindow(configs, win);
            const titleShade = configs.some(
              (config) =>
                config.className === win.className &&
                config.title !== "" &&
                config.title === win.title,
            );
            return (
              <List.Item
                key={win.address}
                title={win.title || win.className || "Untitled"}
                subtitle={windowSubtitle(win, match)}
                icon={match ? Icon.Brush : Icon.AppWindow}
                accessories={match ? [{ text: shaderLabel(match.shader) }] : undefined}
                keywords={[win.className, win.title, win.workspace, "shade"]}
                actions={
                  <ActionPanel>
                    <Action.Push
                      title={match ? `Edit ${match.name}` : "Set shade"}
                      icon={Icon.Pencil}
                      target={
                        <DarkWindowForm
                          config={match ?? draftFromWindow(win, undefined, false)}
                          titleHint={win.title}
                          saved={Boolean(match)}
                          onSave={async (config) => {
                            const ok = await handlers.onSave(config);
                            if (ok) afterChange();
                            return ok;
                          }}
                          onDelete={
                            match
                              ? async (config) => {
                                  const ok = await handlers.onDelete(config);
                                  if (ok) afterChange();
                                  return ok;
                                }
                              : undefined
                          }
                        />
                      }
                    />
                    {win.title && !titleShade ? (
                      <Action.Push
                        title="Shade only this title"
                        icon={Icon.Plus}
                        target={
                          <DarkWindowForm
                            config={draftFromWindow(win, match, true)}
                            saved={false}
                            onSave={async (config) => {
                              const ok = await handlers.onSave(config);
                              if (ok) afterChange();
                              return ok;
                            }}
                          />
                        }
                      />
                    ) : null}
                    {match ? (
                      <Action
                        title={`Remove ${match.name}`}
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        onAction={() => {
                          void confirmRemove(match, async () => {
                            const ok = await handlers.onDelete(match);
                            if (ok) afterChange();
                          });
                        }}
                      />
                    ) : null}
                    <Action
                      title="Refresh"
                      icon={Icon.ArrowClockwise}
                      onAction={() => void load()}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ) : null}
    </List>
  );
}

function DarkWindowSaved({ handlers }: { handlers: ShadeHandlers }) {
  const [configs, setConfigs] = useState(handlers.configs);
  const afterChange = () => setConfigs(savedNow());
  const sorted = [...configs].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  return (
    <List navigationTitle="Saved shades" searchBarPlaceholder="Filter saved shades...">
      <List.Section
        title="Saved shades"
        subtitle="Open one to change the shader, the class, or the title"
      >
        <List.Item
          title="New shade"
          subtitle="Match a class, and a title if you want only one window"
          icon={Icon.Plus}
          actions={
            <ActionPanel>
              <Action.Push
                title="New shade"
                icon={Icon.Plus}
                target={
                  <DarkWindowForm
                    config={blankShade()}
                    saved={false}
                    onSave={async (config) => {
                      const ok = await handlers.onSave(config);
                      if (ok) afterChange();
                      return ok;
                    }}
                  />
                }
              />
            </ActionPanel>
          }
        />
        {sorted.map((config) => (
          <List.Item
            key={config.id}
            title={config.name}
            subtitle={shadeSummary(config)}
            icon={Icon.Brush}
            accessories={[{ text: shaderLabel(config.shader) }]}
            keywords={[config.className, config.title, config.shader, "shade"]}
            actions={
              <ActionPanel>
                <Action.Push
                  title={`Edit ${config.name}`}
                  icon={Icon.Pencil}
                  target={
                    <DarkWindowForm
                      config={config}
                      saved
                      onSave={async (next) => {
                        const ok = await handlers.onSave(next);
                        if (ok) afterChange();
                        return ok;
                      }}
                      onDelete={async (next) => {
                        const ok = await handlers.onDelete(next);
                        if (ok) afterChange();
                        return ok;
                      }}
                    />
                  }
                />
                <Action
                  title={`Remove ${config.name}`}
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  onAction={() => {
                    void confirmRemove(config, async () => {
                      const ok = await handlers.onDelete(config);
                      if (ok) afterChange();
                    });
                  }}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

function DarkWindowForm({
  config,
  titleHint,
  saved,
  onSave,
  onDelete,
}: {
  config: DarkWindowConfig;
  titleHint?: string;
  saved: boolean;
  onSave: (config: DarkWindowConfig) => Promise<boolean>;
  onDelete?: (config: DarkWindowConfig) => Promise<boolean>;
}) {
  const { pop } = useNavigation();
  const [shader, setShader] = useState<DarkWindowShader>(config.shader);
  const [onlyTitle, setOnlyTitle] = useState(config.title !== "");

  const submit = async (values: Form.Values) => {
    try {
      const picked = values.shader;
      const nextShader =
        picked === "invert" || picked === "tint" || picked === "chromakey"
          ? picked
          : shader;
      const matchTitle =
        typeof values.onlyTitle === "boolean" ? values.onlyTitle : onlyTitle;
      const next = normalizeDarkWindow({
        ...config,
        name: text(values.name),
        className: text(values.className),
        title: matchTitle ? text(values.title) : "",
        shader: nextShader,
        tintStrength: numberOr(values.tintStrength, config.tintStrength),
        tintColor: colorOr(values.tintColor, config.tintColor),
        bkg: colorOr(values.bkg, config.bkg),
        similarity: numberOr(values.similarity, config.similarity),
        amount: numberOr(values.amount, config.amount),
        targetOpacity: numberOr(values.targetOpacity, config.targetOpacity),
      });
      if (matchTitle && !next.title) {
        throw new Error("Enter the title, or turn off Only this title");
      }
      if (await onSave(next)) pop();
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Couldn't save shade",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <Form
      navigationTitle={config.name || "Shade"}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save shade" icon={Icon.Checkmark} onSubmit={(values) => void submit(values)} />
          {saved && onDelete ? (
            <Action
              title="Remove shade"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              onAction={() => {
                void confirmRemove(config, async () => {
                  if (await onDelete(config)) pop();
                });
              }}
            />
          ) : null}
        </ActionPanel>
      }
    >
      <Form.Description text="One shader per window. Leave the title off to match every window of this class. A title shade wins over a class shade. Tint and chromakey have to be included in Shaders to load." />
      <Form.TextField id="name" title="Name" defaultValue={config.name} />
      <Form.TextField
        id="className"
        title="Class"
        defaultValue={config.className}
        info="Exact window class, the same one hyprctl clients prints"
      />
      <Form.Checkbox
        id="onlyTitle"
        title="Title"
        label="Only this title"
        value={onlyTitle}
        onChange={setOnlyTitle}
        info="Off matches every window of this class"
      />
      <Form.TextField
        id="title"
        title="Window title"
        defaultValue={config.title || titleHint || ""}
        info="Used when Only this title is on"
      />
      <Form.Dropdown
        id="shader"
        title="Shader"
        value={shader}
        onChange={(value) => {
          if (value === "invert" || value === "tint" || value === "chromakey") {
            setShader(value);
          }
        }}
      >
        <Form.Dropdown.Item title="Invert" value="invert" />
        <Form.Dropdown.Item title="Tint" value="tint" />
        <Form.Dropdown.Item title="Chromakey" value="chromakey" />
      </Form.Dropdown>
      {shader === "tint" ? (
        <>
          <Form.TextField
            id="tintColor"
            title="Tint color"
            defaultValue={formatVec(config.tintColor)}
            placeholder="1 0 0"
            info="#rrggbb or three numbers from 0 to 1"
          />
          <Form.TextField
            id="tintStrength"
            title="Tint strength"
            defaultValue={formatNum(config.tintStrength)}
            info="0 to 1"
          />
        </>
      ) : null}
      {shader === "chromakey" ? (
        <>
          <Form.TextField
            id="bkg"
            title="Background"
            defaultValue={formatVec(config.bkg)}
            placeholder="0 0 0"
            info="Color to fade. #rrggbb or three numbers from 0 to 1"
          />
          <Form.TextField
            id="similarity"
            title="Similarity"
            defaultValue={formatNum(config.similarity)}
            info="0 to 1. How close a pixel has to be"
          />
          <Form.TextField
            id="amount"
            title="Amount"
            defaultValue={formatNum(config.amount)}
            info="0 to 5. How hard matching pixels change"
          />
          <Form.TextField
            id="targetOpacity"
            title="Target opacity"
            defaultValue={formatNum(config.targetOpacity)}
            info="0 to 1"
          />
        </>
      ) : null}
    </Form>
  );
}

function windowSubtitle(
  win: { className: string; workspace: string },
  match: DarkWindowConfig | undefined,
): string {
  const where = [win.className || "No class", win.workspace].filter(Boolean).join(" · ");
  if (!match) return `${where} · No saved shade`;
  return `${where} · ${match.name}`;
}

async function confirmRemove(
  config: DarkWindowConfig,
  run: () => Promise<void>,
): Promise<void> {
  const confirmed = await confirmAlert({
    title: `Remove ${config.name}?`,
    message: "Matching windows lose this shade. Hyprland reloads when Dark Window is loaded.",
    primaryAction: { title: "Remove" },
  });
  if (!confirmed) return;
  await run();
}

function text(value: Form.Value | undefined): string {
  return typeof value === "string" ? value : "";
}

function numberOr(value: Form.Value | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Enter a number");
  }
  const n = Number(value.trim());
  if (!Number.isFinite(n)) throw new Error("Enter a number");
  return n;
}

function colorOr(value: Form.Value | undefined, fallback: Vec3): Vec3 {
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error("Color needs #rrggbb or three numbers from 0 to 1");
  return parseColor(value);
}
