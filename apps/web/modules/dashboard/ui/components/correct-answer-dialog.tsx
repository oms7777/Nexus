"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { toast } from "sonner";

/**
 * Turns a rep's correction into a knowledge base entry, so the assistant stops
 * repeating the same wrong answer to the next visitor.
 */
export function CorrectAnswerDialog({
  open,
  onOpenChange,
  conversationId,
  initialQuestion,
  initialAnswer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: Id<"conversations">;
  initialQuestion: string;
  initialAnswer: string;
}) {
  const submit = useAction(api.private.knowledgeCorrections.submit);
  const [question, setQuestion] = useState(initialQuestion);
  const [answer, setAnswer] = useState(initialAnswer);
  const [isSaving, setIsSaving] = useState(false);

  // The dialog is reused across messages, so reset when a new one is targeted.
  useEffect(() => {
    if (!open) return;
    setQuestion(initialQuestion);
    setAnswer(initialAnswer);
  }, [open, initialQuestion, initialAnswer]);

  const canSubmit = question.trim().length > 0 && answer.trim().length > 0 && !isSaving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSaving(true);
    try {
      await submit({
        conversationId,
        question: question.trim(),
        correctedAnswer: answer.trim(),
      });
      toast.success("Saved to the knowledge base — the assistant will use it from now on.");
      onOpenChange(false);
    } catch {
      toast.error("Could not save this correction. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Teach the assistant</DialogTitle>
          <DialogDescription>
            Save the answer the assistant should have given. It gets indexed into your knowledge
            base and reused for similar questions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="correction-question">Visitor question</Label>
            <Textarea
              id="correction-question"
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What did the visitor actually ask?"
              rows={2}
              value={question}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="correction-answer">Correct answer</Label>
            <Textarea
              id="correction-answer"
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Write the answer you want the assistant to give next time."
              rows={7}
              value={answer}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={handleSubmit} type="button">
            {isSaving ? "Saving…" : "Save to knowledge base"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
