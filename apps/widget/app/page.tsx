"use client"

import { WidgetView } from "@/ui/views/widget-view"
import { use } from "react";

interface Props {
  searchParams: Promise<{
    organizationId: string;
  }>
}


const Page = ( { searchParams }: Props) => {
  const { organizationId } = use(searchParams)


  return (
    <WidgetView organizationId={organizationId}/>
  )


}


export default Page;

// http://localhost:3001/?organizationId=123