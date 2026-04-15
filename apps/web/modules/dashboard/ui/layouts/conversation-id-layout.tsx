import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@workspace/ui/components/resizable";
import { ContactPanel } from "../components/contact-panel";


export const ConversationIdLayout = ({ children }: { children: React.ReactNode;}) => {
    return (
        <ResizablePanelGroup className="h-full min-h-0 flex-1 overflow-hidden" direction="horizontal">
            <ResizablePanel className="h-full min-h-0 overflow-hidden" defaultSize={60}>
                <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
            </ResizablePanel>
            <ResizableHandle className="hidden lg:block"/>
            <ResizablePanel
                className="hidden lg:block h-full min-h-0 overflow-hidden"
                defaultSize={40}
                maxSize={40}
                minSize={20}
            >
                <ContactPanel />
            </ResizablePanel>
        </ResizablePanelGroup>
    )
}