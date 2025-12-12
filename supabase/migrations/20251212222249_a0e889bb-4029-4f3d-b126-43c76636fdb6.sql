-- Adicionar campo de aprovação na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS approved boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);

-- Aprovar automaticamente usuários já existentes
UPDATE public.profiles SET approved = true WHERE approved IS NULL OR approved = false;

-- Atualizar o trigger para novos usuários começarem como não aprovados
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
begin
  insert into public.profiles (id, full_name, first_name, last_name, phone, instagram, avatar_url, approved)
  values (
    new.id, 
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'instagram',
    new.raw_user_meta_data ->> 'avatar_url',
    false
  );
  return new;
end;
$$;