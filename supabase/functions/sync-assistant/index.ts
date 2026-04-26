import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_ASSISTANT_PROMPT = `# Aline e Keila | ACIUM Manaus

## PAPÉIS
Você atende como duas especialistas:

### Aline
Aline faz a triagem inicial.
Ela precisa identificar rapidamente se o cliente quer:
- alianças de namoro
- alianças de casamento
- pingentes dourados
- pingentes prata

### Keila
Keila é a especialista em alianças de casamento.
Quando o cliente estiver buscando alianças de casamento, Aline deve dizer que vai transferir para a Keila e, a partir daí, a conversa segue como Keila.

---

## TOM
- Respostas curtas, elegantes e acolhedoras
- Máximo 2 a 4 linhas por resposta
- Nunca escrever textão
- Nunca listar produtos no texto
- Poucos emojis

---

## REGRAS ABSOLUTAS
1. Nunca invente preço, estoque ou condições.
2. Nunca descreva catálogo em lista no texto.
3. Quando houver catálogo, diga só uma introdução curta.
4. Os cards com foto, cor, código e preço são enviados pelo sistema.
5. Quando o cliente perguntar sobre preço de aliança, você pode lembrar:
   "O valor do card é da unidade. O par sai pelo dobro. 💍"
6. Se o cliente perguntar endereço, responda o endereço da loja.
7. Se o cliente pedir algo ambíguo, pergunte antes de buscar catálogo.

---

## FLUXO DA ALINE
### Se for alianças de casamento
Aline deve responder algo no estilo:
"Perfeito! Vou te transferir para a Keila, nossa especialista em alianças de casamento. 💍"

Depois disso, o fluxo segue como Keila.

### Se for alianças de namoro
Aline conduz assim:
1. confirmar que é namoro/compromisso
2. perguntar a cor
3. quando tiver a cor, buscar catálogo

### Se for pingentes
Aline conduz assim:
1. perguntar a cor, se ainda não tiver
2. quando tiver a cor, buscar catálogo

---

## FLUXO DA KEILA
Keila deve conduzir alianças de casamento nesta ordem:

1. perguntar para quando o cliente deseja fechar
2. perguntar quanto quer investir
3. perguntar se deseja o par ou a unidade
4. perguntar a numeração
5. se o cliente não souber a numeração, tranquilizar:
   "Tudo bem, se você ainda não souber a numeração agora, eu sigo com você mesmo assim 😊"

Depois que essas respostas estiverem coletadas:
- buscar os produtos no catálogo
- enviar cards da cor escolhida
- sempre informar:
  "O valor do card é da unidade. O par sai pelo dobro. 💍"
- depois dos cards, perguntar:
  "Gostou de algum modelo? 😊"

---

## CORES
### Alianças de namoro
- dourada
- prata

Se pedirem preta, azul ou outra:
"Para namoro temos dourada e prata. Qual você prefere? 💍"

### Alianças de casamento
- dourada
- prata
- preta
- azul

### Pingentes
- dourada
- prata

---

## ENDEREÇO
Shopping Sumaúma, Av. Noel Nutels, 1762 - Cidade Nova, Manaus - AM

---

## COMPORTAMENTO
- Nunca repetir apresentação desnecessariamente.
- Nunca disparar catálogo sem contexto suficiente.
- Nunca listar os produtos manualmente.
- Sempre manter a conversa comercial e leve.
- Sempre seguir o papel correto: Aline para triagem, Keila para casamento.`;

function buildInstructionsFromConfig(config: any): string {
  if (config?.system_prompt && String(config.system_prompt).trim()) {
    return String(config.system_prompt).trim();
  }

  const sections: string[] = [];

  sections.push(`# Identidade\nVocê é ${config?.name || "Aline"}.`);

  if (config?.personality) {
    sections.push(`## Personalidade\n${String(config.personality).trim()}`);
  }

  if (config?.greeting) {
    sections.push(`## Saudação\n${String(config.greeting).trim()}`);
  }

  if (Array.isArray(config?.rules) && config.rules.length > 0) {
    sections.push(`## Regras\n${config.rules.map((rule: string) => `- ${rule}`).join("\n")}`);
  }

  if (
    Array.isArray(config?.closing_phrases) &&
    config.closing_phrases.length > 0
  ) {
    sections.push(
      `## Frases de Fechamento\n${config.closing_phrases
        .map((phrase: string) => `- ${phrase}`)
        .join("\n")}`,
    );
  }

  const built = sections.join("\n\n").trim();
  return built || DEFAULT_ASSISTANT_PROMPT;
}

function ensureAlineKeilaPrompt(instructions: string): string {
  const trimmed = String(instructions || "").trim();
  if (!trimmed) return DEFAULT_ASSISTANT_PROMPT;

  const normalized = trimmed.toLowerCase();
  const alreadyAligned =
    normalized.includes("keila") &&
    normalized.includes("alianças de casamento") &&
    normalized.includes("o valor do card é da unidade");

  if (alreadyAligned) {
    return trimmed;
  }

  return `${DEFAULT_ASSISTANT_PROMPT}

---

## CONFIGURAÇÃO COMPLEMENTAR
${trimmed}`;
}

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

    if (!assistant_id) {
      throw new Error("assistant_id is required");
    }

    if (action === "push") {
      const { data: config, error: configError } = await supabase
        .from("ai_agent_config")
        .select("*")
        .eq("id", config_id)
        .single();

      if (configError || !config) {
        throw new Error("Configuração não encontrada");
      }

      const baseInstructions = buildInstructionsFromConfig(config);
      const instructions = ensureAlineKeilaPrompt(baseInstructions);

      const updateResponse = await fetch(
        `https://api.openai.com/v1/assistants/${assistant_id}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openAIApiKey}`,
            "Content-Type": "application/json",
            "OpenAI-Beta": "assistants=v2",
          },
          body: JSON.stringify({
            name: config.name || "Aline",
            instructions,
            model: config.model || "gpt-4o-mini",
          }),
        },
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        throw new Error(
          `Erro ao atualizar Assistant: ${updateResponse.status} - ${errorText}`,
        );
      }

      const assistantData = await updateResponse.json();

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
          prompt_mode: "aline_keila_alinhado",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "pull") {
      const getResponse = await fetch(
        `https://api.openai.com/v1/assistants/${assistant_id}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${openAIApiKey}`,
            "OpenAI-Beta": "assistants=v2",
          },
        },
      );

      if (!getResponse.ok) {
        const errorText = await getResponse.text();
        throw new Error(
          `Erro ao buscar Assistant: ${getResponse.status} - ${errorText}`,
        );
      }

      const assistantData = await getResponse.json();
      const pulledInstructions = ensureAlineKeilaPrompt(
        assistantData.instructions || "",
      );

      const { error: updateError } = await supabase
        .from("ai_agent_config")
        .update({
          name: assistantData.name || "Aline",
          system_prompt: pulledInstructions,
          model: assistantData.model || "gpt-4o-mini",
          updated_at: new Date().toISOString(),
        })
        .eq("id", config_id);

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
            instructions: pulledInstructions,
            instructions_length: pulledInstructions.length,
          },
          prompt_mode: "aline_keila_alinhado",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "get") {
      const getResponse = await fetch(
        `https://api.openai.com/v1/assistants/${assistant_id}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${openAIApiKey}`,
            "OpenAI-Beta": "assistants=v2",
          },
        },
      );

      if (!getResponse.ok) {
        const errorText = await getResponse.text();
        throw new Error(`Erro ao buscar Assistant: ${getResponse.status} - ${errorText}`);
      }

      const assistantData = await getResponse.json();
      const alignedInstructions = ensureAlineKeilaPrompt(
        assistantData.instructions || "",
      );

      return new Response(
        JSON.stringify({
          success: true,
          assistant: {
            id: assistantData.id,
            name: assistantData.name,
            model: assistantData.model,
            instructions: alignedInstructions,
            instructions_length: alignedInstructions.length,
            created_at: assistantData.created_at,
            tools: assistantData.tools,
          },
          prompt_mode: "aline_keila_alinhado",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
