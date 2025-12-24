/**
 * Mapeamento de valores normalizados do banco para exibição na UI
 */

const categoryDisplayMap: Record<string, string> = {
  aliancas: 'Alianças',
  pingente: 'Pingente',
  aneis: 'Anéis',
  personalizacao: 'Personalização',
};

const colorDisplayMap: Record<string, string> = {
  dourada: 'Dourada',
  prata: 'Prata',
  aco: 'Aço',
  preta: 'Preta',
  azul: 'Azul',
  preto: 'Preto',
  dourado: 'Dourado',
  rose: 'Rosé',
  ouro: 'Ouro',
};

/**
 * Converte categoria normalizada do banco para exibição com acentos
 */
export function formatCategory(category: string | null | undefined): string {
  if (!category) return '';
  return categoryDisplayMap[category.toLowerCase()] || capitalizeFirst(category);
}

/**
 * Converte cor normalizada do banco para exibição com acentos
 */
export function formatColor(color: string | null | undefined): string {
  if (!color) return '';
  return colorDisplayMap[color.toLowerCase()] || capitalizeFirst(color);
}

/**
 * Capitaliza a primeira letra de uma string
 */
export function capitalizeFirst(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Normaliza texto para filtros (remove acentos e converte para minúsculo)
 */
export function normalizeForFilter(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Lista de categorias permitidas para selects/filtros
 */
export const allowedCategories = [
  { value: 'aliancas', label: 'Alianças' },
  { value: 'pingente', label: 'Pingente' },
  { value: 'aneis', label: 'Anéis' },
  { value: 'personalizacao', label: 'Personalização' },
];

/**
 * Lista de cores permitidas para selects/filtros
 */
export const allowedColors = [
  { value: 'dourada', label: 'Dourada' },
  { value: 'prata', label: 'Prata' },
  { value: 'aco', label: 'Aço' },
  { value: 'preta', label: 'Preta' },
  { value: 'azul', label: 'Azul' },
];
