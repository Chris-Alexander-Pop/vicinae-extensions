import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@vicinae/api";
import { gvl } from "./gvl";
import { errMessage, type GvlConfig } from "./status";

type Values = {
  url: string;
  token: string;
  address: string;
};

export function ConfigForm({
  config,
  onSaved,
}: {
  config: GvlConfig | null;
  onSaved: () => void;
}) {
  const { pop } = useNavigation();

  const onSubmit = async (values: Values) => {
    const url = (values.url ?? "").trim();
    const token = (values.token ?? "").trim();
    const address = (values.address ?? "").trim();
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Saving gvl config…",
    });
    try {
      if (url) {
        await gvl(["config", "set-url", url], { json: false, timeoutMs: 5000 });
      }
      if (token) {
        await gvl(["config", "set-token", token], {
          json: false,
          timeoutMs: 5000,
        });
      }
      if (address) {
        await gvl(["config", "set-address", address], {
          json: false,
          timeoutMs: 5000,
        });
      }
      toast.style = Toast.Style.Success;
      toast.title = "Config saved";
      onSaved();
      pop();
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.title = "Config save failed";
      toast.message = errMessage(err);
    }
  };

  return (
    <Form
      navigationTitle="gvl config"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Config"
            icon={Icon.Cog}
            onSubmit={(v) => void onSubmit(v as Values)}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Writes ~/.config/gvl/config.yaml. Leave token blank to keep the current secret." />
      <Form.TextField
        id="url"
        title="Daemon URL"
        placeholder="http://127.0.0.1:8080"
        defaultValue={config?.url ?? ""}
      />
      <Form.PasswordField
        id="token"
        title="Token"
        placeholder={config?.tokenSet ? "leave blank to keep" : "optional"}
      />
      <Form.TextField
        id="address"
        title="Device IP"
        placeholder="192.168.0.10"
        defaultValue={config?.address ?? ""}
      />
    </Form>
  );
}
