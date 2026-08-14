import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@vicinae/api";
import type { LightStatus } from "./status";

type Values = {
  hex: string;
  brightness: string;
};

function normalizeHex(raw: string): string | null {
  const s = raw.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return `#${s.toLowerCase()}`;
}

export function ColorForm({
  apply,
  currentBrightness,
}: {
  apply: (args: string[], title: string) => Promise<LightStatus | null>;
  currentBrightness?: number;
}) {
  const { pop } = useNavigation();

  const onSubmit = async (values: Values) => {
    const hex = normalizeHex(values.hex ?? "");
    if (!hex) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Need a hex color",
        message: "Use #RRGGBB or 6 hex digits",
      });
      return;
    }
    const args = ["set", "on", "colour", hex];
    const bright = values.brightness?.trim();
    if (bright) {
      const n = Number(bright);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Brightness must be 0–100",
        });
        return;
      }
      args.push("bright", String(Math.round(n)));
    }
    const next = await apply(args, `Color ${hex}`);
    if (next) pop();
  };

  return (
    <Form
      navigationTitle="Custom color"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Set Color"
            icon={Icon.Swatch}
            onSubmit={(v) => void onSubmit(v as Values)}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Hex like #ff8800, or 6 digits. Optionally set brightness 0–100 at the same time." />
      <Form.TextField
        id="hex"
        title="Color"
        placeholder="#ff8800"
        autoFocus
      />
      <Form.TextField
        id="brightness"
        title="Brightness"
        placeholder={
          currentBrightness != null
            ? `leave empty to keep ${currentBrightness}%`
            : "optional 0–100"
        }
      />
    </Form>
  );
}
