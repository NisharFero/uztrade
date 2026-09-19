export type AiProvider = "groq" | "hugging_face" | "deterministic";
export type AgenticAiTaskName = "document_intelligence" | "compliance_review" | "transit_capacity" | "procedure_execution";

export type AgenticAiRequest = {
  task: AgenticAiTaskName;
  system: string;
  prompt: string;
  documents?: string[];
};

export type AgenticAiProviderResult = {
  provider: Exclude<AiProvider, "deterministic">;
  model: string;
  text: string;
};

export type AgenticAiClient = {
  groq?: (request: AgenticAiRequest) => Promise<AgenticAiProviderResult | null>;
  huggingFace?: (request: AgenticAiRequest) => Promise<AgenticAiProviderResult | null>;
};

export type AgenticAiTaskInput = AgenticAiRequest & {
  fallback: Record<string, unknown>;
};

export type AgenticAiTaskResult = {
  data: Record<string, unknown>;
  aiProviders: AiProvider[];
  modelOutputs: {
    groq?: { model: string; text: string };
    huggingFace?: { model: string; text: string };
  };
};

type Fetcher = typeof fetch;

export function createAgenticAiClient(input: {
  groqApiKey?: string | null;
  groqModel?: string | null;
  docaiUrl?: string | null;
  fetcher?: Fetcher;
}): AgenticAiClient {
  const fetcher = input.fetcher ?? fetch;
  const client: AgenticAiClient = {};

  if (input.groqApiKey) {
    client.groq = async (request) => {
      const response = await fetcher("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.groqApiKey}`,
        },
        body: JSON.stringify({
          model: input.groqModel || "openai/gpt-oss-20b",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.prompt },
          ],
        }),
      });
      if (!response.ok) return null;
      const body = (await response.json().catch(() => ({}))) as {
        model?: string;
        choices?: { message?: { content?: string } }[];
      };
      const content = body.choices?.[0]?.message?.content?.trim();
      if (!content) return null;
      const text = (() => {
        try {
          const parsed = JSON.parse(content) as Record<string, unknown>;
          return String(parsed.summary ?? parsed.result ?? parsed.text ?? content);
        } catch {
          return content;
        }
      })();
      return { provider: "groq", model: body.model || input.groqModel || "openai/gpt-oss-20b", text };
    };
  }

  if (input.docaiUrl) {
    client.huggingFace = async (request) => ({
      provider: "hugging_face",
      model: "impira/layoutlm-document-qa",
      text: request.documents?.length
        ? `Hugging Face DocAI is configured at ${input.docaiUrl} for ${request.documents.length} document spec(s).`
        : `Hugging Face DocAI is configured at ${input.docaiUrl}.`,
    });
  }

  return client;
}

export function agenticAiFromEnv(env: {
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  DOCAI_URL?: string;
}): AgenticAiClient {
  return createAgenticAiClient({
    groqApiKey: env.GROQ_API_KEY,
    groqModel: env.GROQ_MODEL,
    docaiUrl: env.DOCAI_URL || "http://127.0.0.1:8765",
  });
}

export async function runAgenticAiTask(input: AgenticAiTaskInput, client: AgenticAiClient = {}): Promise<AgenticAiTaskResult> {
  const data: Record<string, unknown> = { ...input.fallback };
  const aiProviders: AiProvider[] = [];
  const modelOutputs: AgenticAiTaskResult["modelOutputs"] = {};

  if (input.task === "document_intelligence" && client.huggingFace) {
    const hf = await client.huggingFace(input).catch(() => null);
    if (hf) {
      aiProviders.push("hugging_face");
      modelOutputs.huggingFace = { model: hf.model, text: hf.text };
      data.docaiSummary = hf.text;
    }
  }

  if ((input.task === "compliance_review" || input.task === "transit_capacity" || input.task === "procedure_execution") && client.groq) {
    const groq = await client.groq(input).catch(() => null);
    if (groq) {
      aiProviders.push("groq");
      modelOutputs.groq = { model: groq.model, text: groq.text };
      data.llmSummary = groq.text;
    }
  }

  if (!aiProviders.length) aiProviders.push("deterministic");
  data.aiProviders = aiProviders;
  if (Object.keys(modelOutputs).length) data.modelOutputs = modelOutputs;

  return { data, aiProviders, modelOutputs };
}
