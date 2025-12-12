-- Adicionar campo de classificação de lead nas conversas
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS lead_status text DEFAULT 'novo';

-- Adicionar comentário explicando os valores possíveis
COMMENT ON COLUMN public.conversations.lead_status IS 'Classificação do lead: novo, frio, quente, comprador, sem_interesse';