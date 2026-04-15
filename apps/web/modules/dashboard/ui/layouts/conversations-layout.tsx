import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@workspace/ui/components/resizable";
import { ConversationsPanel } from "../components/conversations-panel";

export const ConversationsLayout = ({
    children 
}: { children: React.ReactNode; }) => {
    return (
        <ResizablePanelGroup className="h-full min-h-0 flex-1 overflow-hidden" direction="horizontal">
            <ResizablePanel defaultSize={30} maxSize={30} minSize={20}>
                <ConversationsPanel />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel className="h-full min-h-0 overflow-hidden" defaultSize={70}>
                {children}
            </ResizablePanel>
        </ResizablePanelGroup>
    )
}