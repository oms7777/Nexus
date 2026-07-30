import { CustomizationView } from "@/modules/customization/ui/views/customization-view";
import { OperationsGate } from "@/modules/auth/ui/components/operations-gate";

export default function Page() {
  return (
    <OperationsGate title="Widget Customization">
      <CustomizationView />
    </OperationsGate>
  );
}
