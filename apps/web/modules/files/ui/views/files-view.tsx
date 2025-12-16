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
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";

type KnowledgeMode = "llm_only" | "llm_plus_kb" | "kb_only";
type LlmProvider = "openai" | "google";

export const FilesView = () => {
  const widgetSettings = useQuery(api.private.widgetSettings.getOne);
  const upsertWidgetSettings = useMutation(api.private.widgetSettings.upsert);

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

  const [savingAi, setSavingAi] = useState(false);

  // Local UI state (hydrated from settings)
  const [knowledgeMode, setKnowledgeMode] = useState<KnowledgeMode>("llm_plus_kb");
  const [llmProvider, setLlmProvider] = useState<LlmProvider>("openai");
  const [llmModel, setLlmModel] = useState<string>("gpt-4o-mini");

  // Hydrate from DB
  useEffect(() => {
    if (!widgetSettings) return;

    const km = (widgetSettings.knowledgeMode ?? "llm_plus_kb") as KnowledgeMode;
    setKnowledgeMode(km);

    const prov = (widgetSettings.llmProvider ?? "openai") as LlmProvider;
    setLlmProvider(prov);

    const model = widgetSettings.llmModel ?? (prov === "google" ? "gemini-1.5-pro" : "gpt-4o-mini");
    setLlmModel(model);
  }, [widgetSettings]);

  const kbEnabled = useMemo(() => knowledgeMode !== "llm_only", [knowledgeMode]);

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
        llmModel: llmModel?.trim() || undefined,
      } as any);

      toast.success("AI settings saved");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save AI settings");
    } finally {
      setSavingAi(false);
    }
  };

  // Small helper UX: when provider changes, suggest a default model
  const handleProviderChange = (value: LlmProvider) => {
    setLlmProvider(value);

    // Only auto-change if user is still on a common default
    const isDefaultOpenAI = llmModel === "gpt-4o-mini" || llmModel === "gpt-4o";
    const isDefaultGoogle = llmModel === "gemini-1.5-pro" || llmModel === "gemini-1.5-flash";

    if (value === "openai" && !isDefaultOpenAI) return;
    if (value === "google" && !isDefaultGoogle) return;

    setLlmModel(value === "google" ? "gemini-1.5-pro" : "gpt-4o-mini");
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
      <UploadDialog onOpenChange={setUploadDialogOpen} open={uploadDialogOpen} />

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
                  Control how the assistant uses your Knowledge Base and which LLM it runs on.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {/* Knowledge mode */}
                <div className="space-y-2">
                  <Label>Knowledge mode</Label>
                  <Select value={knowledgeMode} onValueChange={(v) => setKnowledgeMode(v as KnowledgeMode)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="llm_plus_kb">LLM + KB (recommended)</SelectItem>
                      <SelectItem value="kb_only">KB only (strict)</SelectItem>
                      <SelectItem value="llm_only">LLM only (no KB)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {knowledgeMode === "llm_plus_kb" &&
                      "Uses the KB when helpful, otherwise answers with the LLM."}
                    {knowledgeMode === "kb_only" &&
                      "Answers only if the KB contains the information (otherwise offers human help)."}
                    {knowledgeMode === "llm_only" &&
                      "Ignores the KB entirely (useful if your docs aren’t ready yet)."}
                  </p>
                </div>

                {/* Provider */}
                <div className="space-y-2">
                  <Label>LLM provider</Label>
                  <Select value={llmProvider} onValueChange={(v) => handleProviderChange(v as LlmProvider)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="google">Google (Gemini)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    This applies to the chat assistant (and can also drive voice if you map Vapi assistants accordingly).
                  </p>
                </div>

                {/* Model */}
                <div className="space-y-2">
                  <Label>LLM model</Label>
                  <Input
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    placeholder={llmProvider === "google" ? "gemini-1.5-pro" : "gpt-4o-mini"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Example: {llmProvider === "google" ? "gemini-1.5-pro / gemini-1.5-flash" : "gpt-4o-mini / gpt-4o"}
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
                These documents are indexed and used by your assistant to answer product and support questions.
              </div>
              <Button onClick={() => setUploadDialogOpen(true)} disabled={!kbEnabled}>
                <PlusIcon className="mr-2 h-4 w-4" />
                Add document
              </Button>
            </div>

            {!kbEnabled ? (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                The knowledge base is currently disabled (LLM only). Switch to “LLM + KB” or “KB only” to upload and use documents.
              </div>
            ) : (
              <>
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
                              No knowledge documents yet. Start by uploading a PDF, DOCX, or TXT file.
                            </TableCell>
                          </TableRow>
                        );
                      }

                      return files.results.map((file) => (
                        <TableRow className="hover:bg-muted/50" key={file.id}>
                          <TableCell className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <FileIcon className="h-4 w-4 text-muted-foreground" />
                              <span className="truncate text-sm font-medium">{file.name}</span>
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
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
