const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization"
};

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...init.headers
    }
  });
}

export function optionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
}
