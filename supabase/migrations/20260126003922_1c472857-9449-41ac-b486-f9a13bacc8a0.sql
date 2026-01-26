-- Adicionar configuração do endereço da loja
INSERT INTO public.store_settings (key, value, description)
VALUES ('store_address', 'Shopping Sumaúma, Av. Noel Nutels, 1762 - Cidade Nova, Manaus - AM', 'Endereço da loja física')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();