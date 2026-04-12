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
import { usePaginatedQuery, useMutation, useQuery, useAction } from "convex/react";
import type { PublicFile } from "@workspace/backend/private/files";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { InfiniteScrollTrigger } from "@workspace/ui/components/infinite-scroll-trigger";
import { UploadDialog } from "../components/upload-dialog";
import { DeleteFileDialog } from "../components/delete-file-dialog";

import {
  FileIcon,
  GlobeIcon,
  MoreHorizontalIcon,
  PlusIcon,
  TrashIcon,
  Loader2Icon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { IconType } from "react-icons";
import { api } from "@workspace/backend/_generated/api";
import { toast } from "sonner";
import { AiOutlineOpenAI } from "react-icons/ai";
import { SiClaude, SiGooglegemini } from "react-icons/si";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import {
  DEFAULT_LLM_MODEL,
  getLlmModelLabel,
  getLlmModelOptions,
  type LlmProviderId,
} from "../../constants/llm-models";

type KnowledgeMode = "llm_plus_kb" | "kb_only";
type LlmProvider = LlmProviderId;
type WebsiteSyncFrequency = "off" | "daily" | "weekly";

const LLM_PROVIDER_META: Record<LlmProvider, { label: string; Icon: IconType }> = {
  openai: { label: "OpenAI", Icon: AiOutlineOpenAI },
  google: { label: "Google (Gemini)", Icon: SiGooglegemini },
  anthropic: { label: "Anthropic (Claude)", Icon: SiClaude },
};

export const FilesView = () => {
  const widgetSettings = useQuery(api.private.widgetSettings.getOne);
  const upsertWidgetSettings = useMutation(api.private.widgetSettings.upsert);
  const websiteIndexingSettings = useQuery(api.private.websiteIndexing.getSettings);
  const upsertWebsiteIndexingSettings = useMutation(api.private.websiteIndexing.upsertSettings);

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<PublicFile | null>(null);
  const [savingAi, setSavingAi] = useState(false);
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [websiteSyncFrequency, setWebsiteSyncFrequency] = useState<WebsiteSyncFrequency>("off");

  const crawlSiteAction = useAction(api.private.files.crawlSite);

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
  const [llmModel, setLlmModel] = useState<string>(DEFAULT_LLM_MODEL.openai);

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

    const stored = (widgetSettings.llmModel as string | undefined)?.trim();
    if (stored) {
      setLlmModel(stored);
    } else {
      setLlmModel(DEFAULT_LLM_MODEL[prov]);
    }
  }, [widgetSettings]);

  useEffect(() => {
    if (!websiteIndexingSettings) return;
    setWebsiteSyncFrequency((websiteIndexingSettings.frequency ?? "off") as WebsiteSyncFrequency);
    if (websiteIndexingSettings.rootUrl) setCrawlUrl(websiteIndexingSettings.rootUrl);
  }, [websiteIndexingSettings]);

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
        llmModel,
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
    setLlmModel(DEFAULT_LLM_MODEL[value]);
  };

  const modelOptions = useMemo(
    () => getLlmModelOptions(llmProvider, llmModel),
    [llmProvider, llmModel]
  );

  const modelTriggerLabel = useMemo(
    () => getLlmModelLabel(llmProvider, llmModel),
    [llmProvider, llmModel]
  );

  const handleCrawlSite = async () => {
    const url = crawlUrl.trim();
    if (!url) {
      toast.error("Enter a valid URL");
      return;
    }
    try {
      setCrawling(true);
      const result = await crawlSiteAction({ rootUrl: url });
      await upsertWebsiteIndexingSettings({
        rootUrl: url,
        frequency: websiteSyncFrequency,
        enabled: websiteSyncFrequency !== "off",
      });
      if (result.pagesIndexed === 0) {
        toast.warning(
          "No pages were added. The site may be client-rendered (SPA) or pages have very little text. Try adding important pages as PDF or TXT in \"Add document\"."
        );
      } else {
        toast.success(
          `Site indexed: ${result.pagesIndexed} page${result.pagesIndexed !== 1 ? "s" : ""} added to your Knowledge Base.`
        );
      }
      setRefreshToken((x) => x + 1);
    } catch (e: any) {
      const msg = e?.data?.message ?? e?.message ?? "Failed to index site";
      toast.error(msg);
    } finally {
      setCrawling(false);
    }
  };

  if (widgetSettings === undefined || websiteIndexingSettings === undefined) {
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
                  Control how the assistant uses your Knowledge Base, which AI
                  provider runs the chat, and the model balance (speed vs depth).
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
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

                <div className="flex flex-col gap-4">
                  <div className="space-y-2">
                    <Label>LLM provider</Label>
                    <Select
                      value={llmProvider}
                      onValueChange={(v) => handleProviderChange(v as LlmProvider)}
                    >
                      <SelectTrigger className="h-auto min-h-10 w-full min-w-[12rem]">
                        <span className="flex min-w-0 flex-1 items-center gap-2.5">
                          {(() => {
                            const { Icon } = LLM_PROVIDER_META[llmProvider];
                            return (
                              <Icon className="size-4 shrink-0 opacity-90" aria-hidden />
                            );
                          })()}
                          <SelectValue placeholder="Select provider" />
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(LLM_PROVIDER_META) as LlmProvider[]).map((key) => {
                          const { Icon, label } = LLM_PROVIDER_META[key];
                          return (
                            <SelectItem key={key} value={key} className="cursor-pointer">
                              <span className="flex items-center gap-2.5">
                                <Icon className="size-4 shrink-0 opacity-90" aria-hidden />
                                {label}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select value={llmModel} onValueChange={setLlmModel}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select model">
                          {modelTriggerLabel}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-w-[min(100vw-2rem,28rem)]">
                        {modelOptions.map((m) => (
                          <SelectItem key={m.id} value={m.id} className="items-start py-3">
                            <div className="flex flex-col gap-1 text-left">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium leading-none">{m.label}</span>
                                {m.recommended ? (
                                  <Badge variant="outline" className="text-[10px] font-normal">
                                    Recommended
                                  </Badge>
                                ) : null}
                              </div>
                              <span className="text-xs text-muted-foreground font-normal leading-snug">
                                {m.hint}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {modelOptions.find((opt) => opt.id === llmModel)?.hint ??
                        "Pick the default for your provider, or a larger model for richer answers (often slower and higher cost)."}
                    </p>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Applies to the website chat assistant. Stronger models may be
                    slower or use more API usage on your provider account.
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

          {/* Index your website */}
          <div className="rounded-lg border bg-background px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
              <div className="flex-1 space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <GlobeIcon className="h-4 w-4" />
                  Index your website
                </Label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Input
                    type="url"
                    placeholder="https://yourwebsite.com"
                    value={crawlUrl}
                    onChange={(e) => setCrawlUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCrawlSite()}
                    className="max-w-md"
                    disabled={crawling}
                  />
                  <div className="w-full max-w-[220px]">
                    <Select
                      value={websiteSyncFrequency}
                      onValueChange={(v) => setWebsiteSyncFrequency(v as WebsiteSyncFrequency)}
                    >
                      <SelectTrigger disabled={crawling}>
                        <SelectValue placeholder="Auto-sync" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">Auto-sync: Off</SelectItem>
                        <SelectItem value="daily">Auto-sync: Daily</SelectItem>
                        <SelectItem value="weekly">Auto-sync: Weekly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter your site URL. We&apos;ll crawl up to 20 pages and add them to your Knowledge Base.
                  If auto-sync is enabled, we&apos;ll re-index automatically.
                </p>
                {websiteIndexingSettings?.lastRunAt ? (
                  <p className="text-xs text-muted-foreground">
                    Last indexed: {new Date(websiteIndexingSettings.lastRunAt).toLocaleString()} ·{" "}
                    {websiteIndexingSettings.lastPagesIndexed ?? 0} page
                    {websiteIndexingSettings.lastPagesIndexed === 1 ? "" : "s"} added
                    {websiteIndexingSettings.lastStatus === "error" && websiteIndexingSettings.lastError
                      ? ` · Error: ${websiteIndexingSettings.lastError}`
                      : ""}
                  </p>
                ) : null}
              </div>
              <Button
                onClick={handleCrawlSite}
                disabled={crawling || !crawlUrl.trim()}
                className="shrink-0"
              >
                {crawling ? (
                  <>
                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                    Indexing…
                  </>
                ) : (
                  "Index site"
                )}
              </Button>
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
