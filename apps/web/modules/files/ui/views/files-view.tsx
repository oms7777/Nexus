"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { useInfiniteScroll } from "@workspace/ui/hooks/use-infinite-scroll";
import { usePaginatedQuery, useMutation, useQuery } from "convex/react";
import type { PublicFile } from "@workspace/backend/private/files";
import { Button } from "@workspace/ui/components/button";
import {
  FileIcon,
  MoreHorizontalIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";
import { api } from "@workspace/backend/_generated/api";
import { InfiniteScrollTrigger } from "@workspace/ui/components/infinite-scroll-trigger";
import { UploadDialog } from "../components/upload-dialog";
import { useState } from "react";
import { DeleteFileDialog } from "../components/delete-file-dialog";
import { Switch } from "@workspace/ui/components/switch";
import { Loader2Icon } from "lucide-react";

export const FilesView = () => {
  const widgetSettings = useQuery(api.private.widgetSettings.getOne);
  const setKnowledgeMode = useMutation(
    api.private.widgetSettings.setKnowledgeMode,
  );

  const files = usePaginatedQuery(
    api.private.files.list,
    { category: "kb" },
    { initialNumItems: 10 },
  );

  const {
    topElementRef,
    handleLoadMore,
    canLoadMore,
    isLoadingFirstPage,
    isLoadingMore,
  } = useInfiniteScroll({
    status: files.status,
    loadMore: files.loadMore,
    loadSize: 10,
  });

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<PublicFile | null>(null);
  const [updatingKb, setUpdatingKb] = useState(false);

  const handleDeleteClick = (file: PublicFile) => {
    setSelectedFile(file);
    setDeleteDialogOpen(true);
  };

  const handleFileDeleted = () => {
    setSelectedFile(null);
  };

  if (widgetSettings === undefined) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-y-2 bg-muted">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Loading knowledge base settings…
        </p>
      </div>
    );
  }

  const kbEnabled =
    (widgetSettings?.knowledgeMode ?? "llm_plus_kb") !== "llm_only";

  const handleToggleKb = async (checked: boolean) => {
    try {
      setUpdatingKb(true);
      await setKnowledgeMode({
        knowledgeMode: checked ? "llm_plus_kb" : "llm_only",
      });
    } finally {
      setUpdatingKb(false);
    }
  };

  return (
    <>
      <DeleteFileDialog
        onOpenChange={setDeleteDialogOpen}
        open={deleteDialogOpen}
        file={selectedFile}
        onDeleted={handleFileDeleted}
      />
      <UploadDialog
        onOpenChange={setUploadDialogOpen}
        open={uploadDialogOpen}
      />

      <div className="flex min-h-screen flex-col bg-muted p-8">
        <div className="mx-auto w-full max-w-screen-xl space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-4xl">Knowledge Base (AI)</h1>
            <p className="text-sm text-muted-foreground md:text-base">
              Upload and manage documents used by your AI assistant.
            </p>
          </div>

          {/* KB toggle */}
          <div className="rounded-lg border bg-background px-6 py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">
                  Enable Knowledge Base for the assistant
                </p>
                <p className="text-xs text-muted-foreground">
                  When disabled, your AI assistant will answer using the model
                  only, without searching uploaded documents.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {updatingKb && (
                  <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <Switch
                  checked={kbEnabled}
                  onCheckedChange={handleToggleKb}
                  disabled={updatingKb}
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-background">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div className="text-sm text-muted-foreground">
                These documents are indexed and used by your assistant to answer
                product and support questions.
              </div>
              <Button
                onClick={() => setUploadDialogOpen(true)}
                disabled={!kbEnabled}
              >
                <PlusIcon className="mr-2 h-4 w-4" />
                Add document
              </Button>
            </div>

            {!kbEnabled ? (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                The knowledge base is currently disabled. Enable it above to
                upload and use documents.
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-6 py-4 font-medium">
                        Name
                      </TableHead>
                      <TableHead className="px-6 py-4 font-medium">
                        Type
                      </TableHead>
                      <TableHead className="px-6 py-4 font-medium">
                        Size
                      </TableHead>
                      <TableHead className="px-6 py-4 font-medium">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      if (isLoadingFirstPage) {
                        return (
                          <TableRow>
                            <TableCell
                              className="h-24 text-center text-sm text-muted-foreground"
                              colSpan={4}
                            >
                              Loading files…
                            </TableCell>
                          </TableRow>
                        );
                      }

                      if (files.results.length === 0) {
                        return (
                          <TableRow>
                            <TableCell
                              className="h-24 text-center text-sm text-muted-foreground"
                              colSpan={4}
                            >
                              No knowledge documents yet. Start by uploading a
                              PDF, DOCX, or TXT file.
                            </TableCell>
                          </TableRow>
                        );
                      }

                      return files.results.map((file) => (
                        <TableRow
                          className="hover:bg-muted/50"
                          key={file.id}
                        >
                          <TableCell className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <FileIcon className="h-4 w-4 text-muted-foreground" />
                              <span className="truncate text-sm font-medium">
                                {file.name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <Badge className="uppercase" variant="outline">
                              {file.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                            {file.size}
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  className="size-8 p-0"
                                  size="sm"
                                  variant="ghost"
                                >
                                  <MoreHorizontalIcon className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => handleDeleteClick(file)}
                                >
                                  <TrashIcon className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ));
                    })()}
                  </TableBody>
                </Table>

                {!isLoadingFirstPage && files.results.length > 0 && (
                  <div className="border-t">
                    <InfiniteScrollTrigger
                      canLoadMore={canLoadMore}
                      isLoadingMore={isLoadingMore}
                      onLoadMore={handleLoadMore}
                      ref={topElementRef}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
