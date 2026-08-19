type OpenAiError = {
  status?: number;
  code?: string;
  type?: string;
};

export function openAiErrorResponse(error: unknown, fallback: string) {
  const value = error as OpenAiError;
  if (value.code === "credit_balance_exhausted" || value.code === "insufficient_quota") {
    return Response.json({ error: "OpenAI credits are empty. Add billing credits, then try again." }, { status: 402 });
  }
  if (value.status === 401) {
    return Response.json({ error: "The OpenAI API key was rejected. Replace it and restart the app." }, { status: 401 });
  }
  if (value.status === 403) {
    return Response.json({ error: "This OpenAI project does not have access to the configured model." }, { status: 403 });
  }
  if (value.status === 429) {
    return Response.json({ error: "OpenAI is rate-limiting requests. Wait briefly and try again." }, { status: 429 });
  }
  return Response.json({ error: fallback }, { status: 500 });
}
