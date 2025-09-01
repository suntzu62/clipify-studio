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

const schema = z.object({
  youtube_url: z
    .string()
    .min(1, "Informe a URL do YouTube")
    .refine((v) => isValidYouTubeUrl(v), "URL do YouTube inválida"),
  title: z.string().max(200, "Máx 200 caracteres").optional(),
});

type Schema = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
};

export default function NewProjectDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<Schema>({
    resolver: zodResolver(schema),
    defaultValues: { youtube_url: "", title: "" },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      setSubmitting(true);
      await createProject({ youtube_url: values.youtube_url.trim(), title: values.title?.trim() });
      toast({ title: "Projeto criado", description: "Seu projeto foi criado com sucesso." });
      onOpenChange(false);
      form.reset();
      onCreated?.();
    } catch (err: any) {
      toast({ title: "Erro ao criar projeto", description: err?.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Projeto</DialogTitle>
          <DialogDescription>
            Informe a URL de um vídeo do YouTube para iniciar um novo projeto.
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

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Como deseja nomear o projeto" {...field} />
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
                {submitting ? "Criando..." : "Criar projeto"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

