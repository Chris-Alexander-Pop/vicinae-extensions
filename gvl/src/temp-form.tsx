import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@vicinae/api";
import { TEMP_PRESETS } from "./presets";
import type { LightStatus } from "./status";

type Values = {
  kelvin: string;
  preset: string;
  brightness: string;
};

export function TempForm({
  apply,
  currentKelvin,
}: {
  apply: (args: string[], title: string) => Promise<LightStatus | null>;
  currentKelvin?: number;
}) {
  const { pop } = useNavigation();

  const onSubmit = async (values: Values) => {
    const typed = (values.kelvin ?? "").trim().toLowerCase();
    const preset = (values.preset ?? "").trim();
    const raw = typed || preset;
    if (!raw) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Pick a preset or enter Kelvin",
      });
      return;
    }
    const known = TEMP_PRESETS.find((t) => t.name === raw);
    let token = raw;
    if (!known) {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1800 || n > 9000) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Temperature must be 1800–9000K or a preset",
        });
        return;
      }
      token = String(n);
    }
    const args = ["set", "on", "temp", token];
    const bright = values.brightness?.trim();
    if (bright) {
      const b = Number(bright);
      if (!Number.isFinite(b) || b < 0 || b > 100) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Brightness must be 0–100",
        });
        return;
      }
      args.push("bright", String(Math.round(b)));
    }
    const next = await apply(args, `Temperature ${token}`);
    if (next) pop();
  };

  return (
    <Form
      navigationTitle="Custom temperature"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Set Temperature"
            icon={Icon.Temperature}
            onSubmit={(v) => void onSubmit(v as Values)}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Pick a preset, or type a Kelvin value (1800–9000). Typed Kelvin wins if both are set." />
      <Form.Dropdown
        id="preset"
        title="Preset"
        defaultValue={
          TEMP_PRESETS.find((t) => t.kelvin === currentKelvin)?.name ?? "warm"
        }
      >
        {TEMP_PRESETS.map((t) => (
          <Form.Dropdown.Item
            key={t.name}
            title={`${t.name} · ${t.kelvin}K`}
            value={t.name}
          />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="kelvin"
        title="Kelvin"
        placeholder="optional override"
      />
      <Form.TextField
        id="brightness"
        title="Brightness"
        placeholder="optional 0–100"
      />
    </Form>
  );
}
