import { FilesView } from "@/modules/files/ui/views/files-view"
import { Protect } from "@clerk/nextjs";

const Page = () => {
    return (
        <Protect>
            <FilesView />
        </Protect>
    )
}

export default Page; 