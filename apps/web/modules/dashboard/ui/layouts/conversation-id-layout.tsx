import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@workspace/ui/components/resizable";
import { ContactPanel } from "../components/contact-panel";


export const ConversationIdLayout = ({ children }: { children: React.ReactNode;}) => {
    return (
        <ResizablePanelGroup className="h-full min-h-0 w-full flex-1 overflow-hidden" direction="horizontal">
            <ResizablePanel className="min-h-0" defaultSize={60}>
                <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
                    {children}
                </div>
            </ResizablePanel>
            <ResizableHandle className="hidden lg:block"/>
            <ResizablePanel
                className="hidden min-h-0 lg:block"
                defaultSize={40}
                maxSize={40}
                minSize={20}
            >
                <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background">
                    <ContactPanel />
                </div>
            </ResizablePanel>
        </ResizablePanelGroup>
    )
}