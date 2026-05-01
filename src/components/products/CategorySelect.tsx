import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { useCategories } from '@/hooks/useCategories';
import { useToast } from '@/hooks/use-toast';

interface CategorySelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  includeAllOption?: boolean;
  triggerClassName?: string;
  /** Mostrar botão "+ Nova categoria" no rodapé do dropdown */
  allowCreate?: boolean;
}

export default function CategorySelect({
  value,
  onValueChange,
  placeholder = 'Selecione uma categoria',
  includeAllOption = false,
  triggerClassName,
  allowCreate = true,
}: CategorySelectProps) {
  const { categories, createCategory } = useCategories();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!newLabel.trim()) return;
    setSaving(true);
    try {
      const slug = await createCategory(newLabel);
      if (slug) {
        onValueChange(slug);
        toast({ title: 'Categoria criada', description: `"${newLabel}" foi adicionada.` });
        setNewLabel('');
        setDialogOpen(false);
      }
    } catch (e: any) {
      toast({
        title: 'Erro ao criar categoria',
        description: e?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {includeAllOption && <SelectItem value="all">Todas as categorias</SelectItem>}
          {categories.map((cat) => (
            <SelectItem key={cat.slug} value={cat.slug}>
              {cat.label}
            </SelectItem>
          ))}
          {allowCreate && (
            <div className="border-t mt-1 pt-1">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setDialogOpen(true);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground text-primary"
              >
                <Plus className="w-4 h-4" />
                Nova categoria
              </button>
            </div>
          )}
        </SelectContent>
      </Select>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Nova categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <Label htmlFor="new-category-label">Nome da categoria</Label>
            <Input
              id="new-category-label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Ex: Brincos"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              O nome será usado para exibição. Um identificador interno será gerado automaticamente.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving || !newLabel.trim()}>
              {saving ? 'Criando...' : 'Criar categoria'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
