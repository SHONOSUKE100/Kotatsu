import { ChatGoogleGenerativeAI } from "npm:@langchain/google-genai";
import { BaseMessage, ToolMessage } from "npm:@langchain/core/messages";
import { ChatPromptTemplate } from "npm:@langchain/core/prompts";
import { DynamicStructuredTool } from "npm:@langchain/core/tools";
import { z } from "npm:zod";

import { logDebug, logError, logWarn } from "./log.ts";

export const messageContentToString = (
  content: BaseMessage["content"],
): string => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((chunk) => {
      if (typeof chunk === "string") return chunk;
      if (chunk && typeof chunk === "object" && "text" in chunk) {
        return String(chunk.text);
      }
      return "";
    }).join("");
  }
  if (content && typeof content === "object" && "text" in content) {
    return String((content as { text: unknown }).text ?? "");
  }
  return String(content ?? "");
};

type AgentRunnerOptions = {
  model: ChatGoogleGenerativeAI;
  tools: DynamicStructuredTool[];
  prompt: ChatPromptTemplate;
  maxIterations?: number;
};

export const createAgentRunner = (
  { model, tools, prompt, maxIterations = 8 }: AgentRunnerOptions,
) => {
  const toolsByName = Object.fromEntries(
    tools.map((tool) => [tool.name, tool]),
  );
  const modelWithTools = model.bindTools(tools);

  return async (input: Record<string, unknown>) => {
    const formattedMessages = await prompt.formatMessages(input);
    const conversation: BaseMessage[] = [...formattedMessages];
    logDebug("[Agent] Starting new run", { input });

    for (let step = 0; step < maxIterations; step++) {
      logDebug(`[Agent] Iteration ${step + 1}`);
      const response = await modelWithTools.invoke(conversation);
      conversation.push(response);
      const toolCalls = "tool_calls" in response ? response.tool_calls : [];
      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          const tool = toolsByName[toolCall.name];
          if (!tool) {
            const fallbackId = toolCall.id ?? crypto.randomUUID();
            logWarn(
              `[Agent] Requested tool ${toolCall.name} not found. Responding with warning.`,
              { toolName: toolCall.name },
            );
            conversation.push(
              new ToolMessage({
                tool_call_id: fallbackId,
                name: toolCall.name,
                content: `指定されたツール${toolCall.name}は利用できません。`,
              }),
            );
            continue;
          }
          try {
            const args = typeof toolCall.args === "string"
              ? JSON.parse(toolCall.args)
              : toolCall.args;
            logDebug(`[Agent] Invoking tool ${tool.name}`, { args });
            const result = await tool.invoke(args);
            const resultText = typeof result === "string"
              ? result
              : JSON.stringify(result);
            const toolCallId = toolCall.id ?? crypto.randomUUID();
            logDebug(`[Agent] Tool ${tool.name} succeeded.`);
            conversation.push(
              new ToolMessage({
                tool_call_id: toolCallId,
                name: toolCall.name,
                content: resultText,
              }),
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : `${error}`;
            const toolCallId = toolCall.id ?? crypto.randomUUID();
            logError(`[Agent] Tool ${tool.name} failed: ${message}`, {
              toolName: tool.name,
              error,
            });
            conversation.push(
              new ToolMessage({
                tool_call_id: toolCallId,
                name: toolCall.name,
                content: `ツール実行中にエラー: ${message}`,
              }),
            );
          }
        }
        continue;
      }
      const content = messageContentToString(response.content);
      logDebug("[Agent] Received final response.");
      return content.trim();
    }
    throw new Error(
      "エージェントが所定のステップ数内で回答を完了できませんでした。",
    );
  };
};

export const runChatPrompt = async (
  template: ChatPromptTemplate,
  model: ChatGoogleGenerativeAI,
  input: Record<string, unknown>,
) => {
  logDebug("[Agent] Running chat prompt", { input });
  const messages = await template.formatMessages(input);
  const response = await model.invoke(messages);
  return messageContentToString(response.content).trim();
};

export const runJsonPrompt = async <T>(
  template: ChatPromptTemplate,
  model: ChatGoogleGenerativeAI,
  input: Record<string, unknown>,
  schema: z.ZodSchema<T>,
): Promise<T> => {
  logDebug("[Agent] Running JSON prompt", { input });
  const text = await runChatPrompt(template, model, input);
  return parseJsonWithSchema(text, schema);
};

const stripMarkdownFence = (text: string): string => {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return text.trim();
};

const extractJsonSegment = (text: string): string => {
  const stripped = stripMarkdownFence(text);
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return stripped.slice(firstBrace, lastBrace + 1);
  }
  return stripped;
};

const convertSingleQuotes = (text: string): string => {
  if (!text.includes("'")) return text;
  const singleQuoteJson = text.replace(
    /'([^']*)'/g,
    (_, val) => `"${val.replace(/"/g, '\\"')}"`,
  );
  return singleQuoteJson;
};

const generateJsonCandidates = (text: string): string[] => {
  const cleaned = text.trim();
  if (!cleaned) {
    return [];
  }
  const candidates = new Set<string>();
  const fenced = stripMarkdownFence(cleaned);
  const extracted = extractJsonSegment(fenced);
  candidates.add(extracted);
  candidates.add(convertSingleQuotes(extracted));
  if (extracted !== fenced) {
    candidates.add(fenced);
    candidates.add(convertSingleQuotes(fenced));
  }
  return Array.from(candidates).filter((candidate) => candidate.length > 0);
};

export const parseJsonWithSchema = <T>(
  text: string,
  schema: z.ZodSchema<T>,
): T => {
  logDebug("[Agent] Attempting to parse JSON output.");
  const candidates = generateJsonCandidates(text);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const result = schema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }
    } catch {
      continue;
    }
  }
  throw new Error(
    "JSONとして解析できませんでした: 期待する形式のJSONを抽出できませんでした。\n出力: " +
      text,
  );
};
