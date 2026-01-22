-- Adicionar coluna para foto de perfil do WhatsApp
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS profile_pic_url TEXT;

-- Comentário explicativo
COMMENT ON COLUMN public.customers.profile_pic_url IS 'URL da foto de perfil do WhatsApp obtida via Z-API';