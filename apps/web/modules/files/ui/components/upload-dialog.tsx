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

export const UploadDialog = ({ open, onOpenChange, onFileUploaded }: UploadDialogProps) => {
  const addFile = useAction(api.private.files.addFile);

  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const [uploadForm, setUploadForm] = useState({
    folder: "",
    filename: "",
  });

  const handleFileDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploadedFiles([file]);
    if (!uploadForm.filename) {
      setUploadForm((prev) => ({ ...prev, filename: file.name }));
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setUploadedFiles([]);
    setUploadForm({ folder: "", filename: "" });
  };

  const handleUpload = async () => {
    const blob = uploadedFiles[0];
    if (!blob) return;

    setIsUploading(true);
    try {
      const filename = uploadForm.filename?.trim() || blob.name;
      const folder = uploadForm.folder?.trim() || undefined;

      await addFile({
        bytes: await blob.arrayBuffer(),
        filename,
        mimeType: blob.type || "application/octet-stream",
        category: "kb",     // ✅ force KB
        folder,             // ✅ optional UI folder
      });

      toast.success("File uploaded");
      onFileUploaded?.();
      handleCancel();
    } catch (error) {
      console.error(error);
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
    }
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
            <Label htmlFor="folder">
              Folder / Category <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              className="w-full"
              id="folder"
              onChange={(e) =>
                setUploadForm((prev) => ({ ...prev, folder: e.target.value }))
              }
              placeholder="e.g., Pricing, Support, Sales..."
              type="text"
              value={uploadForm.folder}
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
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
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
