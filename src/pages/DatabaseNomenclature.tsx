import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, Copy, Check, Database, Palette, Tag, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

const nomenclatureText = `# NOMENCLATURA E PADRONIZAÇÃO DO BANCO DE DADOS
# Sistema de Catálogo - Atualizado em ${new Date().toLocaleDateString('pt-BR')}

## 1. CATEGORIAS (coluna: category)

Valores normalizados (sem acentos, minúsculo):
- aliancas → Exibe como "Alianças"
- pingente → Exibe como "Pingente"  
- aneis → Exibe como "Anéis"
- personalizacao → Exibe como "Personalização"

Aliases aceitos (são convertidos automaticamente):
- "Alianças de tungstênio" → aliancas
- "Alianças de aço" → aliancas
- "alianca" → aliancas
- "pingentes" → pingente
- "anel" → aneis
- "personalizacoes" → personalizacao

## 2. CORES (coluna: color)

Valores normalizados (sem acentos, minúsculo):
- dourada → Exibe como "Dourada"
- prata → Exibe como "Prata"
- aco → Exibe como "Aço"
- preta → Exibe como "Preta"
- azul → Exibe como "Azul"
- rose → Exibe como "Rosé"
- ouro → Exibe como "Ouro"

Aliases aceitos:
- "dourado" → dourada
- "Aço" → aco
- "preto" → preta
- "rosé" → rose

## 3. COMO FILTRAR NA API

Ao chamar as APIs de catálogo, você pode enviar os valores com ou sem acentos.
O sistema normaliza automaticamente antes de consultar.

Exemplos de chamadas válidas:
- category=aliancas ✓
- category=Alianças ✓
- category=aliancas de aco ✓
- cor=aco ✓
- cor=Aço ✓
- color=dourada ✓
- color=Dourado ✓

## 4. ENDPOINTS DISPONÍVEIS

### GET /functions/v1/catalog-api
Parâmetros:
- category: string (normalizado automaticamente)
- cor: string (normalizado automaticamente)
- sku: string
- product_id: uuid
- search: string (busca em name e description)
- only_available: boolean

### POST /functions/v1/ai-catalog-search
Body JSON:
{
  "category": "aliancas",
  "color": "aco",
  "search": "tungstênio",
  "min_price": 100,
  "max_price": 500,
  "only_available": "true"
}

## 5. TRIGGER AUTOMÁTICO

Um trigger no banco normaliza automaticamente novos produtos:
- Converte category para o valor padronizado
- Converte color para minúsculo sem acentos
- Isso garante consistência mesmo com inserções manuais

## 6. REGRAS IMPORTANTES PARA A IA

1. SEMPRE use valores normalizados nos filtros (sem acentos, minúsculo)
2. Se o cliente pedir "alianças de aço", filtre por category=aliancas E color=aco
3. A busca por texto (search) funciona normalmente com acentos
4. Priorize filtros exatos (category, color) sobre busca textual
5. Use only_available=true para mostrar apenas produtos com estoque

## 7. MAPEAMENTO RÁPIDO

| Cliente diz... | Filtro correto |
|----------------|----------------|
| alianças | category=aliancas |
| aliança de tungstênio | category=aliancas |
| aliança de aço | category=aliancas, color=aco |
| anel | category=aneis |
| pingente | category=pingente |
| cor dourada | color=dourada |
| cor prata | color=prata |
| aço | color=aco |
| preto/preta | color=preta |
`;

const DatabaseNomenclature = () => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(nomenclatureText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([nomenclatureText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nomenclatura-banco-dados.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Nomenclatura do Banco de Dados
          </h1>
          <p className="text-muted-foreground mt-1">
            Documentação das padronizações para integração com IA
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCopy}>
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </Button>
          <Button onClick={handleDownload}>
            <Download className="w-4 h-4 mr-2" />
            Baixar TXT
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Categorias */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" />
              Categorias Padronizadas
            </CardTitle>
            <CardDescription>
              Valores aceitos para a coluna <code className="bg-muted px-1.5 py-0.5 rounded text-xs">category</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { value: 'aliancas', label: 'Alianças', aliases: ['alianca', 'alianças de tungstênio', 'alianças de aço'] },
                { value: 'pingente', label: 'Pingente', aliases: ['pingentes'] },
                { value: 'aneis', label: 'Anéis', aliases: ['anel'] },
                { value: 'personalizacao', label: 'Personalização', aliases: ['personalizacoes'] },
              ].map(cat => (
                <div key={cat.value} className="p-4 rounded-lg border bg-card">
                  <Badge variant="default" className="mb-2">{cat.value}</Badge>
                  <p className="text-sm text-muted-foreground mb-2">Exibe: {cat.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Aliases: {cat.aliases.join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Cores */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-primary" />
              Cores Padronizadas
            </CardTitle>
            <CardDescription>
              Valores aceitos para a coluna <code className="bg-muted px-1.5 py-0.5 rounded text-xs">color</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { value: 'dourada', label: 'Dourada', bg: 'bg-yellow-500' },
                { value: 'prata', label: 'Prata', bg: 'bg-gray-400' },
                { value: 'aco', label: 'Aço', bg: 'bg-slate-500' },
                { value: 'preta', label: 'Preta', bg: 'bg-gray-800' },
                { value: 'azul', label: 'Azul', bg: 'bg-blue-500' },
                { value: 'rose', label: 'Rosé', bg: 'bg-pink-400' },
                { value: 'ouro', label: 'Ouro', bg: 'bg-amber-500' },
              ].map(color => (
                <div key={color.value} className="p-4 rounded-lg border bg-card flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full ${color.bg}`} />
                  <div>
                    <Badge variant="outline">{color.value}</Badge>
                    <p className="text-xs text-muted-foreground mt-1">→ {color.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Exemplos de Filtros */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Exemplos de Filtros para IA
            </CardTitle>
            <CardDescription>
              Mapeamento do que o cliente diz para os filtros corretos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Cliente diz...</th>
                    <th className="text-left py-2 px-3 font-medium">Filtro correto</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    { input: '"quero ver alianças"', filter: 'category=aliancas' },
                    { input: '"aliança de tungstênio"', filter: 'category=aliancas' },
                    { input: '"aliança de aço"', filter: 'category=aliancas, color=aco' },
                    { input: '"anel"', filter: 'category=aneis' },
                    { input: '"pingente"', filter: 'category=pingente' },
                    { input: '"cor dourada"', filter: 'color=dourada' },
                    { input: '"cor prata"', filter: 'color=prata' },
                    { input: '"na cor aço"', filter: 'color=aco' },
                    { input: '"preto" ou "preta"', filter: 'color=preta' },
                    { input: '"aliança dourada"', filter: 'category=aliancas, color=dourada' },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-muted/50">
                      <td className="py-2 px-3 text-muted-foreground">{row.input}</td>
                      <td className="py-2 px-3">
                        <code className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs">
                          {row.filter}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* TXT Completo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Documento Completo
            </CardTitle>
            <CardDescription>
              Copie ou baixe este texto para enviar à sua IA
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
              {nomenclatureText}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DatabaseNomenclature;
