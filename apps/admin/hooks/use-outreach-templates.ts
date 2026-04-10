"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { OutreachTemplate } from "@/types/leads";

export function useOutreachTemplates() {
  return useQuery<OutreachTemplate[]>({
    queryKey: ["outreach-templates"],
    queryFn: async () => {
      const res = await fetch("/api/outreach-templates");
      if (!res.ok) throw new Error("Failed to fetch templates");
      const data = await res.json();
      return data.templates;
    },
    staleTime: 60_000,
  });
}

export function useCreateOutreachTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; stage: string; message_template: string }) => {
      const res = await fetch("/api/outreach-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create template");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach-templates"] });
    },
  });
}

export function useUpdateOutreachTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<OutreachTemplate> }) => {
      const res = await fetch(`/api/outreach-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update template");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach-templates"] });
    },
  });
}

export function useDeleteOutreachTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/outreach-templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete template");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach-templates"] });
    },
  });
}
