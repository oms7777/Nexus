import { CustomizationView } from "@/modules/customization/ui/views/customization-view"
import { Protect } from "@clerk/nextjs";

const Page = () => {
    return (
        <Protect
        >
            <CustomizationView />
        </Protect>
    )
}

export default Page; 