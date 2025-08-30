import { Id } from "@workspace/backend/_generated/dataModel";

const Page = async ({
    params,
}: {
    params: Promise<{
        conversationId: string;
    }>
}) => {
    const { conversationId } = await params;

    return <ConversationIdView conversationId={conversationId as Id<"conversations">}/>
}

export default Page;