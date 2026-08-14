import { Action, ActionPanel, Form, Icon, useNavigation } from "@vicinae/api";
import { NAMED_COLORS, TEMP_PRESETS } from "./presets";

type Values = {
  color?: string;
  colorA?: string;
  colorB?: string;
  temp?: string;
  tempA?: string;
  tempB?: string;
  low?: string;
  high?: string;
  speed?: string;
  brightness?: string;
  minBrightness?: string;
};

function colorItems() {
  return NAMED_COLORS.map((c) => (
    <Form.Dropdown.Item key={c.name} title={c.name} value={c.name} />
  ));
}

function tempItems() {
  return TEMP_PRESETS.map((t) => (
    <Form.Dropdown.Item
      key={t.name}
      title={`${t.name} · ${t.kelvin}K`}
      value={t.name}
    />
  ));
}

function numOr(raw: string | undefined, fallback: number): number | null {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function ModeForm({
  name,
  onStart,
}: {
  name: string;
  onStart: (args: string[], title: string) => Promise<boolean>;
}) {
  const { pop } = useNavigation();

  const onSubmit = async (values: Values) => {
    const speed = numOr(values.speed, 1);
    const brightness = numOr(values.brightness, 100);
    const minB = numOr(values.minBrightness, 15);
    if (speed == null || brightness == null || minB == null) return;
    if (brightness < 0 || brightness > 100 || minB < 0 || minB > 100) return;

    const args: string[] = ["mode", name];
    switch (name) {
      case "fade":
        if (!values.colorA || !values.colorB) return;
        args.push(values.colorA, values.colorB);
        break;
      case "breathe":
      case "pulse":
        if (values.color && values.color !== "__none__") args.push(values.color);
        break;
      case "temp-fade":
        if (!values.tempA || !values.tempB) return;
        args.push(values.tempA, values.tempB);
        break;
      case "temp-cycle":
        args.push("--low", values.low || "warm", "--high", values.high || "cool");
        break;
      case "blend":
        if (!values.color || !values.temp) return;
        args.push(values.color, values.temp);
        break;
      default:
        break;
    }
    args.push(
      "-b",
      String(Math.round(brightness)),
      "--speed",
      String(speed),
      "--min-brightness",
      String(Math.round(minB)),
    );
    const ok = await onStart(args, `Mode ${name}`);
    if (ok) pop();
  };

  return (
    <Form
      navigationTitle={`Mode · ${name}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={`Start ${name}`}
            icon={Icon.Play}
            onSubmit={(v) => void onSubmit(v as Values)}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Runs on gvld. Peak brightness, speed, and floor apply to every mode." />
      {name === "fade" ? (
        <>
          <Form.Dropdown id="colorA" title="From color" defaultValue="red">
            {colorItems()}
          </Form.Dropdown>
          <Form.Dropdown id="colorB" title="To color" defaultValue="blue">
            {colorItems()}
          </Form.Dropdown>
        </>
      ) : null}
      {name === "breathe" || name === "pulse" ? (
        <Form.Dropdown id="color" title="Color" defaultValue="teal">
          <Form.Dropdown.Item title="(keep current)" value="__none__" />
          {colorItems()}
        </Form.Dropdown>
      ) : null}
      {name === "temp-fade" ? (
        <>
          <Form.Dropdown id="tempA" title="From temp" defaultValue="warm">
            {tempItems()}
          </Form.Dropdown>
          <Form.Dropdown id="tempB" title="To temp" defaultValue="cool">
            {tempItems()}
          </Form.Dropdown>
        </>
      ) : null}
      {name === "temp-cycle" ? (
        <>
          <Form.Dropdown id="low" title="Low" defaultValue="warm">
            {tempItems()}
          </Form.Dropdown>
          <Form.Dropdown id="high" title="High" defaultValue="cool">
            {tempItems()}
          </Form.Dropdown>
        </>
      ) : null}
      {name === "blend" ? (
        <>
          <Form.Dropdown id="color" title="Color" defaultValue="purple">
            {colorItems()}
          </Form.Dropdown>
          <Form.Dropdown id="temp" title="Temperature" defaultValue="daylight">
            {tempItems()}
          </Form.Dropdown>
        </>
      ) : null}
      <Form.TextField id="brightness" title="Peak brightness" defaultValue="100" />
      <Form.TextField id="minBrightness" title="Min brightness" defaultValue="15" />
      <Form.TextField id="speed" title="Speed" defaultValue="1" />
    </Form>
  );
}
