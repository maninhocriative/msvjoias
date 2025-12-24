import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!openAIApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const body = await req.json();
    const { action, assistant_id, config_id } = body;

    console.log("Sync Assistant request:", { action, assistant_id, config_id });

    if (!assistant_id) {
      throw new Error("assistant_id is required");
    }

    // Ação: push - Enviar prompt do CRM para o Playground
    if (action === "push") {
      // Buscar configuração atual do banco
      const { data: config, error: configError } = await supabase
        .from('ai_agent_config')
        .select('*')
        .eq('id', config_id)
        .single();

      if (configError || !config) {
        throw new Error("Configuração não encontrada");
      }

      // Montar as instruções completas
      let instructions = config.system_prompt || "";
      
      // Se não tem prompt, montar a partir das seções
      if (!instructions && config.personality) {
        const sections: string[] = [];
        
        sections.push(`# Identidade\nVocê é ${config.name}.`);
        
        if (config.personality) {
          sections.push(`## Personalidade\n${config.personality}`);
        }
        
        if (config.greeting) {
          sections.push(`## Saudação\n${config.greeting}`);
        }
        
        if (config.rules && config.rules.length > 0) {
          sections.push(`## Regras\n${config.rules.map((r: string) => `- ${r}`).join('\n')}`);
        }
        
        if (config.closing_phrases && config.closing_phrases.length > 0) {
          sections.push(`## Frases de Fechamento\n${config.closing_phrases.map((p: string) => `- ${p}`).join('\n')}`);
        }
        
        instructions = sections.join('\n\n');
      }

      // Atualizar o Assistant no OpenAI
      const updateResponse = await fetch(`https://api.openai.com/v1/assistants/${assistant_id}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openAIApiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2",
        },
        body: JSON.stringify({
          name: config.name,
          instructions: instructions,
          model: config.model || "gpt-4o-mini",
        }),
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error("OpenAI API error:", errorText);
        throw new Error(`Erro ao atualizar Assistant: ${updateResponse.status} - ${errorText}`);
      }

      const assistantData = await updateResponse.json();
      console.log("Assistant updated:", assistantData.id, assistantData.name);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Prompt sincronizado com o Playground!",
          assistant: {
            id: assistantData.id,
            name: assistantData.name,
            model: assistantData.model,
            instructions_length: assistantData.instructions?.length || 0,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ação: pull - Buscar prompt do Playground e trazer para o CRM
    if (action === "pull") {
      // Buscar o Assistant do OpenAI
      const getResponse = await fetch(`https://api.openai.com/v1/assistants/${assistant_id}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${openAIApiKey}`,
          "OpenAI-Beta": "assistants=v2",
        },
      });

      if (!getResponse.ok) {
        const errorText = await getResponse.text();
        console.error("OpenAI API error:", errorText);
        throw new Error(`Erro ao buscar Assistant: ${getResponse.status} - ${errorText}`);
      }

      const assistantData = await getResponse.json();
      console.log("Assistant fetched:", assistantData.id, assistantData.name);

      // Atualizar configuração no banco
      const { error: updateError } = await supabase
        .from('ai_agent_config')
        .update({
          name: assistantData.name || 'Aline',
          system_prompt: assistantData.instructions || '',
          model: assistantData.model || 'gpt-4o-mini',
          updated_at: new Date().toISOString(),
        })
        .eq('id', config_id);

      if (updateError) {
        throw new Error(`Erro ao salvar no banco: ${updateError.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Prompt importado do Playground!",
          assistant: {
            id: assistantData.id,
            name: assistantData.name,
            model: assistantData.model,
            instructions: assistantData.instructions,
            instructions_length: assistantData.instructions?.length || 0,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ação: get - Apenas buscar informações do Assistant
    if (action === "get") {
      const getResponse = await fetch(`https://api.openai.com/v1/assistants/${assistant_id}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${openAIApiKey}`,
          "OpenAI-Beta": "assistants=v2",
        },
      });

      if (!getResponse.ok) {
        const errorText = await getResponse.text();
        console.error("OpenAI API error:", errorText);
        throw new Error(`Erro ao buscar Assistant: ${getResponse.status}`);
      }

      const assistantData = await getResponse.json();

      return new Response(
        JSON.stringify({
          success: true,
          assistant: {
            id: assistantData.id,
            name: assistantData.name,
            model: assistantData.model,
            instructions: assistantData.instructions,
            instructions_length: assistantData.instructions?.length || 0,
            created_at: assistantData.created_at,
            tools: assistantData.tools,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Ação inválida: ${action}. Use 'push', 'pull' ou 'get'.`);

  } catch (error) {
    console.error("Sync Assistant error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
