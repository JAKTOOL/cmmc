// Message protocol between engine.ts (main thread) and worker.ts. Kept
// transport-agnostic on purpose: a future native path (llama.cpp behind a
// Tauri command) can speak the same shapes over IPC instead of postMessage.

import type { LlmDevice } from "./config";

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

/** How the worker sources weights: "local" reads the bundled /models/ tree
 *  (desktop builds); "cache" reads the Cache API entries the engine verified
 *  and stored — the worker itself never goes to the network. */
export type WeightSource = "local" | "cache";

export type ToWorker =
    | {
          type: "load";
          repo: string;
          revision: string;
          dtype: string;
          device: LlmDevice;
          source: WeightSource;
      }
    | {
          type: "generate";
          requestId: number;
          messages: ChatMessage[];
          maxNewTokens: number;
          contextTokens: number;
      }
    | { type: "abort"; requestId: number };

export type FromWorker =
    | { type: "progress"; file: string; loaded: number; total: number }
    | { type: "ready"; device: LlmDevice }
    | { type: "token"; requestId: number; text: string }
    | {
          type: "done";
          requestId: number;
          text: string;
          stats: { tokens: number; ms: number };
      }
    | { type: "error"; requestId?: number; message: string };
