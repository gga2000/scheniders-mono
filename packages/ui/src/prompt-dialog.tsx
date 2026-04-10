"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./dialog";
import { Input } from "./input";
import { Button } from "./button";

interface PromptDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  isOpen,
  title,
  description,
  placeholder,
  defaultValue = "",
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, defaultValue]);

  const handleConfirm = () => {
    onConfirm(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirm();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription className="text-muted-foreground">{description}</DialogDescription>}
        </DialogHeader>
        <div className="py-4">
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full text-right"
            dir="rtl"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            إلغاء
          </Button>
          <Button onClick={handleConfirm}>
            تأكيد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function usePrompt() {
  const [promptState, setPromptState] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    placeholder?: string;
    defaultValue?: string;
    resolve: ((value: string | null) => void) | null;
  }>({
    isOpen: false,
    title: "",
    resolve: null,
  });

  const promptUser = (options: { title: string; description?: string; placeholder?: string; defaultValue?: string }) => {
    return new Promise<string | null>((resolve) => {
      setPromptState({
        isOpen: true,
        ...options,
        resolve,
      });
    });
  };

  const PromptComponent = () => (
    <PromptDialog
      isOpen={promptState.isOpen}
      title={promptState.title}
      description={promptState.description}
      placeholder={promptState.placeholder}
      defaultValue={promptState.defaultValue}
      onConfirm={(value) => {
        setPromptState((prev) => ({ ...prev, isOpen: false }));
        if (promptState.resolve) promptState.resolve(value);
      }}
      onCancel={() => {
        setPromptState((prev) => ({ ...prev, isOpen: false }));
        if (promptState.resolve) promptState.resolve(null);
      }}
    />
  );

  return { promptUser, PromptComponent };
}
