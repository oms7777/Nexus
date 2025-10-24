import { Protect } from "@clerk/nextjs";


import { FilesView } from "@/modules/files/ui/views/files-view"
import { PremiumFeatureOverlay } from "@/modules/billing/ui/components/premium-feature-overlay";

const Page = () => {
    return (
        <Protect>
            <FilesView />
        </Protect>
    )
}

export default Page; 