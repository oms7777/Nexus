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
import { Badge } from "@workspace/ui/components/badge";
import { InfiniteScrollTrigger } from "@workspace/ui/components/infinite-scroll-trigger";
import { UploadDialog } from "../components/upload-dialog";
import { DeleteFileDialog } from "../components/delete-file-dialog";

import {
  FileIcon,
  MoreHorizontalIcon,
  PlusIcon,
  TrashIcon,
  Loader2Icon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@workspace/backend/_generated/api";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Label } from "@workspace/ui/components/label";

type KnowledgeMode = "llm_plus_kb" | "kb_only";
type LlmProvider = "openai" | "google";

export const FilesView = () => {
  const widgetSettings = useQuery(api.private.widgetSettings.getOne);
  const upsertWidgetSettings = useMutation(api.private.widgetSettings.upsert);

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<PublicFile | null>(null);
  const [savingAi, setSavingAi] = useState(false);

  // ✅ Used to force re-run of the query after upload
  const [refreshToken, setRefreshToken] = useState(0);

  // ✅ SINGLE source of truth for files
  const files = usePaginatedQuery(
    api.private.files.list,
    { refreshToken },
    { initialNumItems: 10 }
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

  // Local UI state (hydrated from settings)
  const [knowledgeMode, setKnowledgeMode] = useState<KnowledgeMode>("llm_plus_kb");
  const [llmProvider, setLlmProvider] = useState<LlmProvider>("openai");

  // Hydrate from DB (sanitize legacy "llm_only" -> "llm_plus_kb")
  useEffect(() => {
    if (!widgetSettings) return;

    const rawKm = (widgetSettings.knowledgeMode ?? "llm_plus_kb") as
      | "llm_only"
      | "llm_plus_kb"
      | "kb_only";

    const km: KnowledgeMode = rawKm === "llm_only" ? "llm_plus_kb" : (rawKm as KnowledgeMode);
    setKnowledgeMode(km);

    const prov = (widgetSettings.llmProvider ?? "openai") as LlmProvider;
    setLlmProvider(prov);
  }, [widgetSettings]);

  const kbEnabled = useMemo(() => true, []); // ✅ always enabled now (since llm_only removed)

  const handleDeleteClick = (file: PublicFile) => {
    setSelectedFile(file);
    setDeleteDialogOpen(true);
  };

  const handleFileDeleted = () => {
    setSelectedFile(null);
  };

  const handleSaveAiSettings = async () => {
    try {
      setSavingAi(true);

      await upsertWidgetSettings({
        knowledgeMode,
        llmProvider,
      } as any);

      toast.success("AI settings saved");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save AI settings");
    } finally {
      setSavingAi(false);
    }
  };

  const handleProviderChange = (value: LlmProvider) => {
    setLlmProvider(value);
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

  return (
    <>
      <DeleteFileDialog
        onOpenChange={setDeleteDialogOpen}
        open={deleteDialogOpen}
        file={selectedFile}
        onDeleted={handleFileDeleted}
      />

      <UploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onFileUploaded={() => setRefreshToken((x) => x + 1)}
      />

      <div className="flex min-h-screen flex-col bg-muted p-8">
        <div className="mx-auto w-full max-w-screen-xl space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-4xl">Knowledge Base (AI)</h1>
            <p className="text-sm text-muted-foreground md:text-base">
              Upload and manage documents used by your AI assistant.
            </p>
          </div>

          {/* AI Settings */}
          <div className="rounded-lg border bg-background px-6 py-4">
            <div className="flex flex-col gap-6">
              <div className="space-y-1">
                <p className="text-sm font-medium">AI Settings</p>
                <p className="text-xs text-muted-foreground">
                  Control how the assistant uses your Knowledge Base and which
                  LLM provider it runs on.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Knowledge mode</Label>
                  <Select
                    value={knowledgeMode}
                    onValueChange={(v) => setKnowledgeMode(v as KnowledgeMode)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="llm_plus_kb">
                        LLM + KB (recommended)
                      </SelectItem>
                      <SelectItem value="kb_only">KB only (strict)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {knowledgeMode === "llm_plus_kb" &&
                      "Uses the KB when helpful, otherwise answers with the LLM."}
                    {knowledgeMode === "kb_only" &&
                      "Answers only if the KB contains the information (otherwise offers human help)."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>LLM provider</Label>
                  <Select
                    value={llmProvider}
                    onValueChange={(v) => handleProviderChange(v as LlmProvider)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="google">Google (Gemini)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    This applies to the chat assistant (and can also drive voice
                    if you map Vapi assistants accordingly).
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                {savingAi && (
                  <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <Button onClick={handleSaveAiSettings} disabled={savingAi}>
                  {savingAi ? "Saving…" : "Save AI settings"}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-background">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div className="text-sm text-muted-foreground">
                These documents are indexed and used by your assistant to answer
                product and support questions.
              </div>
              <Button onClick={() => setUploadDialogOpen(true)} disabled={!kbEnabled}>
                <PlusIcon className="mr-2 h-4 w-4" />
                Add document
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-6 py-4 font-medium">Name</TableHead>
                  <TableHead className="px-6 py-4 font-medium">Type</TableHead>
                  <TableHead className="px-6 py-4 font-medium">Size</TableHead>
                  <TableHead className="px-6 py-4 font-medium">Actions</TableHead>
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
                          No knowledge documents yet. Start by uploading a PDF,
                          DOCX, or TXT file.
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return files.results.map((file) => (
                    <TableRow className="hover:bg-muted/50" key={file.id}>
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <FileIcon className="h-4 w-4 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {file.name}
                            </div>
                            {file.folder ? (
                              <div className="truncate text-xs text-muted-foreground">
                                Folder: {file.folder}
                              </div>
                            ) : null}
                          </div>
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
                            <Button className="size-8 p-0" size="sm" variant="ghost">
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
          </div>
        </div>
      </div>
    </>
  );
};
