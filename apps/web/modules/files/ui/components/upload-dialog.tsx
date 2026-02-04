"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useAction } from "convex/react";
import { useState } from "react";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@workspace/ui/components/dropzone";
import { api } from "@workspace/backend/_generated/api";
import { toast } from "sonner";

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileUploaded?: () => void;
}

function withTimeout<T>(p: Promise<T>, ms: number) {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Upload timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export const UploadDialog = ({ open, onOpenChange, onFileUploaded }: UploadDialogProps) => {
  const addFile = useAction(api.private.files.addFile);

  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    category: "",
    filename: "",
  });

  const handleFileDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setUploadedFiles([file]);
      if (!uploadForm.filename) {
        setUploadForm((prev) => ({ ...prev, filename: file.name }));
      }
    }
  };

  const handleUpload = async () => {
    setIsUploading(true);

    try {
      const blob = uploadedFiles[0];
      if (!blob) return;

      const filename = uploadForm.filename?.trim() || blob.name;

      // category optional => backend will default to "kb"
      const category = uploadForm.category?.trim() || undefined;

      await withTimeout(
        addFile({
          bytes: await blob.arrayBuffer(),
          filename,
          mimeType: blob.type || "application/octet-stream",
          category,
        }),
        45000, // ✅ UI timeout (45s)
      );

      toast.success("File uploaded");
      onFileUploaded?.();
      handleCancel();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Upload failed");
      // keep dialog open so user can retry
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setUploadedFiles([]);
    setUploadForm({ category: "", filename: "" });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Upload documents to your knowledge base for AI-powered search and retrieval
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category">Folder / Category <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              className="w-full"
              id="category"
              onChange={(e) =>
                setUploadForm((prev) => ({ ...prev, category: e.target.value }))
              }
              placeholder="e.g., Sales, Support, Pricing…"
              type="text"
              value={uploadForm.category}
              disabled={isUploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="filename">
              Filename <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              className="w-full"
              id="filename"
              onChange={(e) =>
                setUploadForm((prev) => ({ ...prev, filename: e.target.value }))
              }
              placeholder="Override default filename"
              type="text"
              value={uploadForm.filename}
              disabled={isUploading}
            />
          </div>

          <Dropzone
            accept={{
              "application/pdf": [".pdf"],
              "text/csv": [".csv"],
              "text/plain": [".txt"],
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
                ".docx",
              ],
            }}
            disabled={isUploading}
            maxFiles={1}
            onDrop={handleFileDrop}
            src={uploadedFiles}
          >
            <DropzoneEmptyState />
            <DropzoneContent />
          </Dropzone>
        </div>

        <DialogFooter>
          <Button disabled={isUploading} onClick={handleCancel} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={uploadedFiles.length === 0 || isUploading}>
            {isUploading ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
