-- Adicionar Thiago Silva como admin
INSERT INTO public.user_roles (user_id, role) 
VALUES ('11f973c6-594f-47dd-8f65-5451792a7142', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;