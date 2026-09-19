import assert from "node:assert/strict";
import test from "node:test";
import { PROCEDURES } from "../../../modules/procedures/sync";
import { instantiateWorkflow, type ShipmentFacts } from "../../../modules/workflow/domain";
import { createAgenticAiClient, runAgenticAiTask, type AgenticAiClient } from "../../../modules/workflow/agentic-ai";
import { executeSpecialist } from "../../../modules/workflow/specialists";

const facts: ShipmentFacts = {
  goods: "tea",
  quantity: 60,
  unit: "tonnes",
  origin: "Tashkent",
  destination: "Moscow",
  mode: "train",
};

test("Groq-backed agentic tasks add model output without replacing rule data", async () => {
  const calls: string[] = [];
  const client: AgenticAiClient = {
    async groq(request) {
      calls.push(request.task);
      return {
        provider: "groq",
        model: "openai/gpt-oss-20b",
        text: "Risk narrative generated from deterministic assessment.",
      };
    },
  };

  const result = await runAgenticAiTask(
    {
      task: "compliance_review",
      system: "Explain compliance findings.",
      prompt: "Summarize export risk.",
      fallback: { ruleKey: "tea×export", riskFlags: [{ label: "Export certificate stack" }] },
    },
    client,
  );

  assert.deepEqual(calls, ["compliance_review"]);
  assert.deepEqual(result.aiProviders, ["groq"]);
  assert.equal(result.modelOutputs.groq?.model, "openai/gpt-oss-20b");
  assert.equal(result.data.ruleKey, "tea×export");
  assert.equal(result.data.llmSummary, "Risk narrative generated from deterministic assessment.");
});

test("document-intelligence agent tasks record Hugging Face DocAI involvement", async () => {
  const client: AgenticAiClient = {
    async huggingFace(request) {
      return {
        provider: "hugging_face",
        model: "impira/layoutlm-document-qa",
        text: `DocAI checked ${request.documents.length} document specs.`,
      };
    },
  };

  const result = await runAgenticAiTask(
    {
      task: "document_intelligence",
      system: "Check documents.",
      prompt: "Find missing documents.",
      documents: ["Commercial invoice", "Railway bill"],
      fallback: { completeness: "incomplete" },
    },
    client,
  );

  assert.deepEqual(result.aiProviders, ["hugging_face"]);
  assert.equal(result.modelOutputs.huggingFace?.model, "impira/layoutlm-document-qa");
  assert.equal(result.data.docaiSummary, "DocAI checked 2 document specs.");
});

test("agentic AI falls back deterministically when configured providers are unavailable", async () => {
  const result = await runAgenticAiTask({
    task: "procedure_execution",
    system: "Execute a portal step.",
    prompt: "Submit the generated application.",
    fallback: { status: "simulated_success" },
  });

  assert.deepEqual(result.aiProviders, ["deterministic"]);
  assert.equal(result.data.status, "simulated_success");
});

test("environment client uses Groq chat completions when an API key is configured", async () => {
  const requests: Request[] = [];
  const client = createAgenticAiClient({
    groqApiKey: "test-key",
    fetcher: async (request, init) => {
      requests.push(request instanceof Request ? request : new Request(request, init));
      return Response.json({
        model: "openai/gpt-oss-20b",
        choices: [{ message: { content: JSON.stringify({ summary: "Groq model summary" }) } }],
      });
    },
  });

  const result = await client.groq!({
    task: "procedure_execution",
    system: "Return JSON.",
    prompt: "Explain the action.",
  });

  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /api\.groq\.com/);
  assert.equal(requests[0].headers.get("authorization"), "Bearer test-key");
  assert.equal(result.text, "Groq model summary");
});

test("specialists include Groq and Hugging Face provider metadata on agent runs", async () => {
  const procedure = PROCEDURES["868"];
  const workflow = instantiateWorkflow(procedure, "run-ai");
  const complianceNode = workflow.nodes.find((node) => /customs fee/i.test(node.title))!;
  const documentNode = workflow.nodes.find((node) => node.lane === "agent" && /document|declaration|certificate/i.test(`${node.title} ${node.output}`))!;

  const client: AgenticAiClient = {
    async groq() {
      return { provider: "groq", model: "openai/gpt-oss-20b", text: "Compliance narrative from Groq." };
    },
    async huggingFace() {
      return { provider: "hugging_face", model: "impira/layoutlm-document-qa", text: "Document evidence from Hugging Face." };
    },
  };

  const compliance = await executeSpecialist(complianceNode, facts, { procedure, ai: client });
  assert.ok((compliance.data.aiProviders as string[]).includes("groq"));
  assert.equal(compliance.data.llmSummary, "Compliance narrative from Groq.");
  assert.equal(compliance.data.ruleKey, "tea×export");

  const document = await executeSpecialist(documentNode, facts, { procedure, ai: client });
  assert.ok((document.data.aiProviders as string[]).includes("hugging_face"));
  assert.equal(document.data.docaiSummary, "Document evidence from Hugging Face.");
});
