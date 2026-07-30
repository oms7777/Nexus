import { FilesView } from "@/modules/files/ui/views/files-view";
import { OperationsGate } from "@/modules/auth/ui/components/operations-gate";

export default function Page() {
  return (
    <OperationsGate title="Knowledge Base (AI)">
      <FilesView />
    </OperationsGate>
  );
}
  
