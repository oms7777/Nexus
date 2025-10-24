import { PremiumFeatureOverlay } from "@/modules/billing/ui/components/premium-feature-overlay";
import { VapiView } from "@/modules/plugins/ui/views/vapi-view";
import { Protect } from "@clerk/nextjs";

const Page = () => {
    return (
        <Protect>
            <VapiView />
        </Protect>
    )
}

export default Page; 