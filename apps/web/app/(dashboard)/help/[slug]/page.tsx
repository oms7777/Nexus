"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@workspace/ui/components/button";

import { getHelpArticle } from "@/modules/help/articles";
import { HelpArticleView } from "@/modules/help/ui/help-article-view";

export default function HelpArticlePage() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const article = getHelpArticle(slug);

  if (!article) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">Article not found</h1>
        <p className="text-sm text-muted-foreground">That help page does not exist or was renamed.</p>
        <Button asChild variant="outline">
          <Link href="/help">Back to help</Link>
        </Button>
      </div>
    );
  }

  return <HelpArticleView article={article} />;
}
