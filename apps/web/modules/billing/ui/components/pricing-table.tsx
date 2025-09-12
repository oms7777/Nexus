"use client";

import {PricingTable as ClerkPricingTable } from "@clerk/nextjs";

export const  PricingTable = () => {
    return (
        <div>
            <ClerkPricingTable 
                forOrganizations
                appearance={{
                    elements: {
                        pricingTableCard: "shadow-none! border! rounded-lg!",
                        pricingTableCardHeader: "bg-background!",
                        pricingTableCardBody: "bg-background!",
                        pricingTableCardFooter: "bg-background!",
                    }
                }}
            />
        </div>
    )
}