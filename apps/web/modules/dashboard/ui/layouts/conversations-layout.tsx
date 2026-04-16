import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@workspace/ui/components/resizable";
import { ConversationsPanel } from "../components/conversations-panel";

export const ConversationsLayout = ({
    children 
}: { children: React.ReactNode; }) => {
    return (
        <ResizablePanelGroup className="h-full min-h-0 w-full flex-1 overflow-hidden" direction="horizontal">
            <ResizablePanel className="min-h-0" defaultSize={30} maxSize={30} minSize={20}>
                <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
                    <ConversationsPanel />
                </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel className="min-h-0" defaultSize={70}>
                <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
                    {children}
                </div>
            </ResizablePanel>
        </ResizablePanelGroup>
    )
}