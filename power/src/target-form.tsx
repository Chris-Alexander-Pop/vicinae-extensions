import {
  Action,
  ActionPanel,
  Form,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { isAllowedTarget, TARGET_MAX_C, TARGET_MIN_C } from "./thermal";

type Values = {
  celsius: string;
};

type Props = {
  current: number;
  onSave: (celsius: number) => Promise<void>;
};

export function TargetForm({ current, onSave }: Props) {
  const { pop } = useNavigation();

  const onSubmit = async (values: Values) => {
    const parsed = Number((values.celsius ?? "").trim());
    if (!isAllowedTarget(parsed)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Target out of range",
        message: `Use a whole number from ${TARGET_MIN_C} to ${TARGET_MAX_C}`,
      });
      return;
    }
    await onSave(parsed);
    pop();
  };

  return (
    <Form
      navigationTitle="Package target"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Set Target"
            onSubmit={(values) => void onSubmit(values as Values)}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="celsius"
        title="Target (°C)"
        defaultValue={String(current)}
        placeholder="75"
      />
      <Form.Description
        text={`thermald tries to keep the CPU package near this temperature by limiting power before it gets there. Whole degrees, ${TARGET_MIN_C} to ${TARGET_MAX_C}. The service starts at boot.`}
      />
    </Form>
  );
}
