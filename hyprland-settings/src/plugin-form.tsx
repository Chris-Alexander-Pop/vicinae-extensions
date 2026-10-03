import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { draftValue, parseFieldInput, type PluginField } from "./plugins";
import type { PluginPersistValue } from "./persist";

type Props = {
  field: PluginField;
  current: PluginPersistValue;
  onSubmit: (value: PluginPersistValue) => Promise<boolean>;
};

export function PluginFieldForm({ field, current, onSubmit }: Props) {
  const { pop } = useNavigation();
  const draft = draftValue(current);
  const choices = field.choices;
  const useDropdown = Boolean(choices && choices.length > 0 && !field.allowCustom);

  const submit = async (raw: string) => {
    let parsed: PluginPersistValue;
    try {
      parsed = parseFieldInput(field, raw);
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: field.title,
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (await onSubmit(parsed)) pop();
  };

  return (
    <Form
      navigationTitle={field.title}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save"
            icon={Icon.Checkmark}
            onSubmit={(values) => {
              const raw = values.value;
              void submit(typeof raw === "string" ? raw : "");
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text={field.description} />
      {useDropdown && choices ? (
        <Form.Dropdown id="value" title={field.title} defaultValue={draft}>
          {choices.map((choice) => (
            <Form.Dropdown.Item
              key={choice.value || "none"}
              title={choice.label}
              value={choice.value}
            />
          ))}
        </Form.Dropdown>
      ) : (
        <Form.TextField
          id="value"
          title={field.title}
          defaultValue={draft}
          placeholder={draftValue(field.fallback)}
          info={choiceInfo(field)}
        />
      )}
    </Form>
  );
}

function choiceInfo(field: PluginField): string | undefined {
  if (!field.choices || field.choices.length === 0) {
    if (field.kind === "color") return "8 hex digits, RRGGBBAA";
    return undefined;
  }
  const labels = field.choices
    .map((choice) => (choice.value === "" ? "empty" : choice.value))
    .join(", ");
  return field.allowCustom ? `Examples: ${labels}` : labels;
}
