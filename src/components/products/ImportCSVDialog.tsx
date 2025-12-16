import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Upload, FileSpreadsheet, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CSVProduct {
  categoria: string;
  codigo: string;
  nome: string;
  link: string;
  'link direto': string;
  valor: string;
  cor: string;
}

interface ParsedProduct {
  name: string;
  sku: string;
  category: string;
  image_url: string;
  price: number;
  color: string;
  active: boolean;
}

interface ImportCSVDialogProps {
  onImportComplete: () => void;
}

const ImportCSVDialog = ({ onImportComplete }: ImportCSVDialogProps) => {
  const [open, setOpen] = useState(false);
  const [csvData, setCsvData] = useState<ParsedProduct[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const parseCSV = (text: string): CSVProduct[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    return lines.slice(1).map(line => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      return row as unknown as CSVProduct;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const csvProducts = parseCSV(text);

      const parsed: ParsedProduct[] = csvProducts.map(row => ({
        name: row.nome || '',
        sku: (row.codigo || '').trim(),
        category: row.categoria || '',
        image_url: row['link direto'] || '',
        price: parseFloat(row.valor?.replace(',', '.') || '0'),
        color: row.cor || '',
        active: true,
      })).filter(p => p.name && p.price > 0);

      setCsvData(parsed);
      toast({
        title: 'Arquivo carregado',
        description: `${parsed.length} produtos encontrados no CSV.`,
      });
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleImport = async () => {
    if (csvData.length === 0) return;

    setImporting(true);
    setImportProgress(0);

    try {
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < csvData.length; i++) {
        const product = csvData[i];
        
        const { error } = await supabase
          .from('products')
          .insert([{
            name: product.name,
            sku: product.sku || null,
            category: product.category || null,
            image_url: product.image_url || null,
            price: product.price,
            color: product.color || null,
            active: true,
          }]);

        if (error) {
          console.error('Error inserting product:', product.name, error);
          errorCount++;
        } else {
          successCount++;
        }

        setImportProgress(Math.round(((i + 1) / csvData.length) * 100));
      }

      toast({
        title: 'Importação concluída',
        description: `${successCount} produtos importados com sucesso. ${errorCount > 0 ? `${errorCount} erros.` : ''}`,
        variant: errorCount > 0 ? 'destructive' : 'default',
      });

      if (successCount > 0) {
        onImportComplete();
        setOpen(false);
        setCsvData([]);
      }
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: 'Erro na importação',
        description: 'Ocorreu um erro ao importar os produtos.',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
      setImportProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const resetDialog = () => {
    setCsvData([]);
    setImportProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) resetDialog(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="w-4 h-4" />
          Importar CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Importar Produtos via CSV
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Input */}
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="csv-input"
            />
            <label
              htmlFor="csv-input"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Clique para selecionar um arquivo CSV
              </span>
              <span className="text-xs text-muted-foreground">
                Formato esperado: categoria, codigo, nome, link, link direto, valor, cor
              </span>
            </label>
          </div>

          {/* Preview Table */}
          {csvData.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  <Check className="w-4 h-4 inline mr-1 text-green-500" />
                  {csvData.length} produtos prontos para importar
                </p>
              </div>

              <ScrollArea className="h-[300px] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Nome</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead>Cor</TableHead>
                      <TableHead>Imagem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvData.map((product, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="font-mono text-xs">{product.sku || '—'}</TableCell>
                        <TableCell>{product.category || '—'}</TableCell>
                        <TableCell>R$ {product.price.toFixed(2)}</TableCell>
                        <TableCell>{product.color || '—'}</TableCell>
                        <TableCell>
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-8 h-8 rounded object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {/* Import Progress */}
              {importing && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importando... {importProgress}%
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${importProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetDialog} disabled={importing}>
                  Limpar
                </Button>
                <Button onClick={handleImport} disabled={importing} className="gap-2">
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Importar {csvData.length} produtos
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {/* Help Text */}
          {csvData.length === 0 && (
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 font-medium mb-2">
                <AlertCircle className="w-4 h-4" />
                Formato do CSV esperado:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>categoria</strong> → Categoria do produto</li>
                <li><strong>codigo</strong> → SKU/Código do produto</li>
                <li><strong>nome</strong> → Nome do produto</li>
                <li><strong>link direto</strong> → URL da imagem</li>
                <li><strong>valor</strong> → Preço (ex: 419.00)</li>
                <li><strong>cor</strong> → Cor do produto</li>
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImportCSVDialog;
