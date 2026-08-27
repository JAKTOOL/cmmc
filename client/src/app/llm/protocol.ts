// Message protocol between engine.ts (main thread) and worker.ts. Kept
// transport-agnostic on purpose: a future native path (llama.cpp behind a
// Tauri command) can speak the same shapes over IPC instead of postMessage.

import type { LlmDevice } from "./config";

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export type ToWorker =
    | {
          type: "load";
          repo: string;
          revision: string;
          dtype: string;
          device: LlmDevice;
          /** Count of onnx external-data shards, from the manifest (0 =
           *  self-contained graph). Drives use_external_data_format. */
          externalDataChunks: number;
          /** Desktop path: weights are Tauri bundle resources the webview
           *  cannot fetch by URL. The worker requests each file on demand
           *  ("read-file" -> "file-data") the moment transformers.js asks
           *  for it, and retains nothing — one file crosses at a time,
           *  keeping peak memory to a single copy per file. Absent on
           *  builds where /models/ is reachable from the app origin (dev
           *  server) — then the worker fetches same-origin. */
          ipc?: boolean;
      }
    | {
          /** Reply to a worker "read-file" request. The buffer arrives as a
           *  transferable; null when the file cannot be read. */
          type: "file-data";
          fileId: number;
          data: ArrayBuffer | null;
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
    | {
          /** Debug breadcrumb — the engine forwards it to stderr via the
           *  desktop shell (workers cannot reach Tauri IPC directly). */
          type: "log";
          message: string;
      }
    | {
          /** Ask the engine to read one repo-relative weight file over Tauri
           *  IPC (desktop "ipc" mode only). Answered with "file-data". */
          type: "read-file";
          fileId: number;
          path: string;
      }
    | { type: "ready"; device: LlmDevice }
    | { type: "token"; requestId: number; text: string }
    | {
          type: "done";
          requestId: number;
          text: string;
          stats: { tokens: number; ms: number };
      }
    | { type: "error"; requestId?: number; message: string };
