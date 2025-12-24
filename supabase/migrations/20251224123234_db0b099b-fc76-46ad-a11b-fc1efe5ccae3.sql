-- Tabela para configurar o prompt e comportamento da Aline
CREATE TABLE public.ai_agent_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Aline',
  assistant_id TEXT, -- ID do Assistant no Playground OpenAI
  model TEXT DEFAULT 'gpt-4o-mini',
  
  -- Prompt completo (campo de texto simples)
  system_prompt TEXT,
  
  -- Seções estruturadas do prompt
  personality TEXT, -- Personalidade e tom de voz
  greeting TEXT, -- Mensagem de boas-vindas
  rules TEXT[], -- Regras e restrições
  available_functions TEXT[], -- Funções disponíveis
  product_presentation_template TEXT, -- Template de como apresentar produtos
  closing_phrases TEXT[], -- Frases de fechamento
  
  -- Templates prontos
  active_template TEXT DEFAULT 'vendedora_joias', -- Template ativo
  
  -- Configurações gerais
  max_products_per_message INT DEFAULT 5,
  send_video_priority BOOLEAN DEFAULT true, -- Priorizar vídeo quando houver
  include_sizes BOOLEAN DEFAULT true,
  include_stock BOOLEAN DEFAULT true,
  include_price BOOLEAN DEFAULT true,
  
  -- Metadados
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Templates prontos de prompt
CREATE TABLE public.ai_prompt_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL, -- vendedora_joias, atendimento_formal, etc
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  personality TEXT,
  rules TEXT[],
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Inserir configuração inicial
INSERT INTO public.ai_agent_config (
  name,
  personality,
  greeting,
  rules,
  available_functions,
  product_presentation_template,
  closing_phrases,
  system_prompt
) VALUES (
  'Aline',
  'Você é a Aline, consultora de joias da Acium. Atenciosa, elegante e especialista em ajudar clientes a encontrar a joia perfeita.',
  'Olá! Sou a Aline, sua consultora de joias da Acium. Como posso te ajudar hoje?',
  ARRAY[
    'Sempre ser educada e atenciosa',
    'Não inventar informações sobre produtos',
    'Sempre verificar estoque antes de confirmar disponibilidade',
    'Encaminhar para vendedor humano quando necessário'
  ],
  ARRAY['search_catalog', 'get_product_details', 'check_stock'],
  E'*{{nome}}*\n- *Descrição:* {{descricao}}\n- *Preço:* {{preco}}\n- *Tamanhos disponíveis:* {{tamanhos}}\n- *Cor:* {{cor}}',
  ARRAY[
    'Posso ajudar com mais alguma coisa?',
    'Fico à disposição para qualquer dúvida!',
    'Tem interesse em ver mais modelos?'
  ],
  'Você é a Aline, consultora virtual de joias da Acium. Seja atenciosa, elegante e ajude os clientes a encontrar a joia perfeita. Use as funções disponíveis para buscar produtos no catálogo.'
);

-- Inserir templates prontos
INSERT INTO public.ai_prompt_templates (slug, name, description, system_prompt, personality, rules, is_default) VALUES
('vendedora_joias', 'Vendedora de Joias', 'Consultora elegante especializada em joias', 
 'Você é uma consultora virtual de joias. Seja atenciosa, elegante e ajude os clientes a encontrar a joia perfeita.', 
 'Elegante, atenciosa, conhecedora de joias e tendências',
 ARRAY['Ser educada', 'Não inventar informações', 'Verificar estoque'],
 true),
('atendimento_formal', 'Atendimento Formal', 'Atendimento mais formal e corporativo',
 'Você é uma assistente virtual profissional. Seja formal, objetiva e eficiente no atendimento.',
 'Profissional, formal, objetiva',
 ARRAY['Manter tom formal', 'Ser direta nas respostas'],
 false),
('atendimento_amigavel', 'Atendimento Amigável', 'Atendimento mais descontraído e próximo',
 'Você é uma assistente virtual amigável. Seja descontraída, use emojis com moderação e crie conexão com o cliente.',
 'Amigável, descontraída, próxima',
 ARRAY['Usar linguagem informal', 'Emojis com moderação'],
 false);

-- RLS
ALTER TABLE public.ai_agent_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompt_templates ENABLE ROW LEVEL SECURITY;

-- Políticas para usuários autenticados
CREATE POLICY "Authenticated users can view ai_agent_config" ON public.ai_agent_config
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin and gerente can manage ai_agent_config" ON public.ai_agent_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'gerente'))
  );

CREATE POLICY "Anyone can view templates" ON public.ai_prompt_templates
  FOR SELECT USING (true);

CREATE POLICY "Admin can manage templates" ON public.ai_prompt_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Trigger para updated_at
CREATE TRIGGER update_ai_agent_config_updated_at
  BEFORE UPDATE ON public.ai_agent_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();