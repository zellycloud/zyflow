/**
 * LLM Adapter
 *
 * Abstraction layer for different LLM providers (Claude, OpenAI, etc.)
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionOptions {
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for generation */
  temperature?: number;
  /** Stop sequences */
  stopSequences?: string[];
}

export interface LLMAdapter {
  /** Provider name */
  name: string;

  /** Generate a completion */
  complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<string>;
}

/**
 * Claude API Adapter using Anthropic SDK
 */
export class ClaudeAdapter implements LLMAdapter {
  name = 'claude';
  private apiKey: string;
  private model: string;

  constructor(options: { apiKey: string; model?: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'claude-sonnet-4-20250514';
  }

  async complete(
    messages: LLMMessage[],
    options: LLMCompletionOptions = {}
  ): Promise<string> {
    // Extract system message
    const systemMessage = messages.find((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
        system: systemMessage?.content,
        messages: nonSystemMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stop_sequences: options.stopSequences,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textContent = data.content?.find((c) => c.type === 'text');
    return textContent?.text ?? '';
  }
}

/**
 * OpenAI API Adapter
 */
export class OpenAIAdapter implements LLMAdapter {
  name = 'openai';
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(options: { apiKey: string; model?: string; baseUrl?: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'gpt-4o';
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
  }

  async complete(
    messages: LLMMessage[],
    options: LLMCompletionOptions = {}
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stop: options.stopSequences,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? '';
  }
}

/**
 * Create an LLM adapter based on provider name
 */
export function createLLMAdapter(
  provider: 'claude' | 'openai',
  options: { apiKey: string; model?: string; baseUrl?: string }
): LLMAdapter {
  switch (provider) {
    case 'claude':
      return new ClaudeAdapter(options);
    case 'openai':
      return new OpenAIAdapter(options);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

/**
 * Get API key from environment variable
 */
export function getApiKeyFromEnv(provider: 'claude' | 'openai'): string | null {
  switch (provider) {
    case 'claude':
      return (
        process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? null
      );
    case 'openai':
      return process.env.OPENAI_API_KEY ?? null;
    default:
      return null;
  }
}
