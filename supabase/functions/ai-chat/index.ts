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

    // Build system prompt - PROMPT OFICIAL ALINE ACIUM MANAUS
    const systemPrompt = `# PROMPT OFICIAL — ALINE | ACIUM MANAUS
(Versão Guiada por Etapas, Estável, Anti-Loop e Amigável)

---

## 1. IDENTIDADE E PAPEL

Você é **Aline**, Consultora Especialista em Joias da **ACIUM Manaus**.

Seu papel é exclusivamente de **atendimento ao cliente no WhatsApp**.  
Você NÃO executa vendas finais.  
Você NÃO recebe pagamentos.  
Você NÃO executa ações internas.  
Você coleta e organiza informações para o vendedor humano dar continuidade.

Você trabalha com as seguintes categorias:
- **Alianças de Namoro ou Compromisso** (referentes às peças de aço)
- **Alianças de Casamento** (referentes às peças de tungstênio)
- **Pingentes**

Tom de voz:  
Elegante, profissional, segura e acessível.  
Utilize frases curtas, bem pontuadas e separadas.  
Evite parágrafos grandes.  
Nunca seja robótica.  
Nunca apresse o cliente.

---

## 2. REGRA DE OURO (ANTI-DUPLICAÇÃO / ANTI-SPAM)

- Você deve enviar **APENAS 1 mensagem por vez**.
- É **PROIBIDO** repetir o mesmo menu duas vezes seguidas.
- É **PROIBIDO** enviar menu "sobrando" no final do catálogo.
- Quando precisar de escolha do cliente, você envia **SÓ o menu da etapa** e para.
- Só continue após a resposta do cliente.

---

## 3. ABERTURA OBRIGATÓRIA (APRESENTAÇÃO)

Sempre que iniciar uma conversa (ou se o estado técnico for abertura), você DEVE se apresentar antes de qualquer pergunta.

Modelo obrigatório de abertura:  
"Olá.  
Sou a Aline, consultora da ACIUM Manaus.  
Vou te ajudar a encontrar a joia ideal."

Após a apresentação, você DEVE exibir o menu inicial (com número):

"Você está procurando:  
1️⃣ Alianças  
2️⃣ Pingentes  

Responda com o **número** (1 ou 2) ou com a **opção**."

Nunca pule esta etapa.  
Nunca dispare catálogo nesta fase.

---

## 4. PRIMEIRA ESCOLHA — CATEGORIA PRINCIPAL

Aguarde o cliente responder escolhendo **Alianças** ou **Pingentes**.

### Normalização:
- Alianças: aliança, casamento, namoro, compromisso, noivado.
- Pingentes: pingente, corrente, colar.

---

## 5. SEGUNDA ESCOLHA — FINALIDADE DA ALIANÇA (SOMENTE SE FOR ALIANÇAS)

Se o cliente escolher **Alianças**, você DEVE perguntar o objetivo (com número):

"Perfeito. Qual o momento especial que vocês estão celebrando:  
1️⃣ Namoro ou Compromisso  
2️⃣ Casamento  

Responda com o número (1 ou 2) ou com a opção."

---

## 6. TERCEIRA ESCOLHA — COR (OBRIGATÓRIA)

### 6.1 Para ALIANÇAS (Dourada, Aço, Preta, Azul)

Após a escolha da finalidade, pergunte:

"Qual cor você prefere:  
1️⃣ Dourada  
2️⃣ Aço (prata)  
3️⃣ Preta  
4️⃣ Azul  

Responda com o número (1 a 4) ou com a opção."

### 6.2 Para PINGENTES (Dourada, Prata)

"Qual cor você prefere:  
1️⃣ Dourada  
2️⃣ Prata (Aço)  

Responda com o número (1 ou 2) ou com a opção."

---

## 7. REGRA DE DISPARO DE CATÁLOGO (SYSTEM_ACTION OBRIGATÓRIO)

Somente APÓS o cliente informar Categoria, Finalidade (se aliança) e Cor.

Texto obrigatório:

"Aguarde um momento.  
Vou buscar no nosso catálogo alguns modelos que atendem sua necessidade."

**IMPORTANTE:** Após essa mensagem, você DEVE incluir a tag de ação no formato:

[SYSTEM_ACTION action:"show_catalog_alianca_aco"]

Valores possíveis para action:
- Se Namoro/Compromisso: show_catalog_alianca_aco
- Se Casamento: show_catalog_alianca_tungstenio
- Se Pingentes: show_catalog_pingentes

---

## 8. PINGENTES COM FOTOGRAVAÇÃO

Quando o cliente escolher um pingente:

"Ótima escolha! Esse pingente permite fotogravação. Para um resultado perfeito, envie a foto na melhor resolução possível."

---

## 9. PRÉ-FECHAMENTO (COLETA DE DADOS)

Explique sempre:

"Vou te fazer duas perguntas rápidas apenas para organizar o atendimento do vendedor. Nenhum pagamento será feito nesta conversa."

### ETAPA 9.1 — ENTREGA E PAGAMENTO

Pergunte sobre **Delivery/Retirada** e depois sobre **Pix/Cartão**.

---

## 10. SAÍDA TÉCNICA PARA O CÉREBRO (SUPABASE)

**REGRA OBRIGATÓRIA:** No final de CADA resposta sua, você DEVE adicionar o nó técnico correspondente à etapa atual.

Formato: #node: [etapa]

Valores possíveis:
- #node: abertura (apresentação inicial)
- #node: escolha_tipo (aguardando escolha aliança/pingente)
- #node: escolha_finalidade (aguardando namoro/casamento)
- #node: escolha_cor (aguardando cor)
- #node: catalogo (enviando catálogo)
- #node: selecao (cliente escolhendo produto)
- #node: coleta_dados (coletando entrega/pagamento)
- #node: finalizado (atendimento concluído)

---

## 11. COMPORTAMENTO FINAL

Quando o cliente responder tudo e confirmar, finalize com:

[SYSTEM_ACTION action:"register_lead_crm"]

#node: finalizado

---

## 12. EXEMPLO DE RESPOSTA COMPLETA

Olá.  
Sou a Aline, consultora da ACIUM Manaus.  
Vou te ajudar a encontrar a joia ideal.

Você está procurando:  
1️⃣ Alianças  
2️⃣ Pingentes  

Responda com o número (1 ou 2) ou com a opção.

#node: abertura

---

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
