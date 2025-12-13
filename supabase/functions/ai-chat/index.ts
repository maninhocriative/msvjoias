import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tools for the AI assistant
const tools = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description: "Search products in the catalog by name, category, color, price range, or tags",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Search term for product name or description"
          },
          category: {
            type: "string",
            description: "Product category to filter"
          },
          color: {
            type: "string",
            description: "Product color to filter"
          },
          min_price: {
            type: "number",
            description: "Minimum price filter"
          },
          max_price: {
            type: "number",
            description: "Maximum price filter"
          },
          only_available: {
            type: "boolean",
            description: "Only show products with stock available"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_product_details",
      description: "Get detailed information about a specific product by ID or SKU",
      parameters: {
        type: "object",
        properties: {
          product_id: {
            type: "string",
            description: "Product UUID"
          },
          sku: {
            type: "string",
            description: "Product SKU code"
          }
        },
        required: []
      }
    }
  }
];

async function searchCatalog(params: Record<string, any>, supabaseUrl: string, supabaseKey: string): Promise<any> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  });

  const response = await fetch(
    `${supabaseUrl}/functions/v1/ai-catalog-search?${searchParams.toString()}`,
    {
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  return await response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!openAIApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const { messages, conversation_id, contact_name } = await req.json();

    console.log("AI Chat request:", { conversation_id, contact_name, messagesCount: messages?.length });

    // Build system prompt
    const systemPrompt = `Você é Aline, uma assistente virtual de vendas amigável e prestativa para uma loja de joias e acessórios.

Suas responsabilidades:
- Ajudar clientes a encontrar produtos no catálogo
- Responder perguntas sobre produtos, preços e disponibilidade
- Sugerir produtos baseados nas preferências do cliente
- Ser cordial, profissional e objetiva

Regras importantes:
- Sempre cumprimente o cliente pelo nome quando disponível
- Quando mostrar produtos, destaque: nome, preço, cores disponíveis e se está em promoção
- Se um produto está em promoção, mencione o desconto
- Se o produto tem brinde, mencione isso
- Sempre pergunte se o cliente precisa de mais ajuda
- Formate valores em Reais (R$)
- Use emojis moderadamente para tornar a conversa mais amigável

${contact_name ? `O nome do cliente é: ${contact_name}` : ""}`;

    // First API call to get the assistant's response
    const initialResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        tools,
        tool_choice: "auto",
        max_tokens: 1000,
      }),
    });

    if (!initialResponse.ok) {
      const errorText = await initialResponse.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${initialResponse.status}`);
    }

    let responseData = await initialResponse.json();
    let assistantMessage = responseData.choices[0].message;

    console.log("Initial response:", JSON.stringify(assistantMessage, null, 2));

    // Handle tool calls if present
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolResults: any[] = [];

      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`Executing tool: ${functionName}`, functionArgs);

        let result;
        if (functionName === "search_catalog" || functionName === "get_product_details") {
          result = await searchCatalog(functionArgs, supabaseUrl, supabaseServiceKey);
        } else {
          result = { error: "Unknown function" };
        }

        console.log(`Tool result for ${functionName}:`, JSON.stringify(result, null, 2).slice(0, 500));

        toolResults.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: JSON.stringify(result),
        });
      }

      // Second API call with tool results
      const finalResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openAIApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
            assistantMessage,
            ...toolResults,
          ],
          max_tokens: 1000,
        }),
      });

      if (!finalResponse.ok) {
        const errorText = await finalResponse.text();
        console.error("OpenAI API error (final):", errorText);
        throw new Error(`OpenAI API error: ${finalResponse.status}`);
      }

      responseData = await finalResponse.json();
      assistantMessage = responseData.choices[0].message;
    }

    const responseText = assistantMessage.content || "Desculpe, não consegui processar sua mensagem.";

    console.log("Final response:", responseText.slice(0, 200));

    return new Response(
      JSON.stringify({
        success: true,
        message: responseText,
        usage: responseData.usage,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("AI Chat error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        message: "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
