import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { createProject } from "@/services/projects";
import { isValidYouTubeUrl } from "@/lib/youtube";
import posthog from 'posthog-js';
import { useAuth } from "@/contexts/AuthContext";

const schema = z.object({
  youtube_url: z
    .string()
    .min(1, "Informe a URL do YouTube")
    .refine((v) => isValidYouTubeUrl(v), "URL do YouTube inválida"),
});

type Schema = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
};

export default function NewProjectDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<Schema>({
    resolver: zodResolver(schema),
    defaultValues: { youtube_url: "" },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      setSubmitting(true);
      await createProject(
        { youtube_url: values.youtube_url.trim() },
        user?.id
      );
      // Telemetry
      try {
        const urlLen = values.youtube_url.trim().length;
        posthog.capture('project created', { youtubeUrl_len: urlLen });
        posthog.capture('pipeline started', { source: 'ui' });
      } catch {
        // no-op: telemetry cannot break project creation
      }
      toast({ title: "Projeto criado", description: "Seu projeto foi criado com sucesso." });
      onOpenChange(false);
      form.reset();
      onCreated?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Tente novamente.";
      toast({ title: "Erro ao criar projeto", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar clips virais</DialogTitle>
          <DialogDescription>
            Cole a URL do YouTube para gerar seus clipes.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="youtube_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL do YouTube</FormLabel>
                  <FormControl>
                    <Input placeholder="https://www.youtube.com/watch?v=..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Gerando clips..." : "Gerar clips"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
