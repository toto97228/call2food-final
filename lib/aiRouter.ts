export type AIProvider = "openai" | "deepseek";

export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GenerateParams = {
  provider: AIProvider;
  messages: AIMessage[];
};

export async function generateAIResponse(params: GenerateParams): Promise<string> {
  const { provider } = params;

  switch (provider) {
    case "deepseek":
      return generateWithDeepSeek(params);

    case "openai":
    default:
      return generateWithOpenAI(params);
  }
}

/* ---------------------- OPENAI ---------------------- */
async function generateWithOpenAI({ messages }: GenerateParams): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY manquant");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.2,
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return data.choices?.[0]?.message?.content ?? "";
}

/* ---------------------- DEEPSEEK ---------------------- */
async function generateWithDeepSeek({ messages }: GenerateParams): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY manquant");

  const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: 0.2,
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return data.choices?.[0]?.message?.content ?? "";
}
