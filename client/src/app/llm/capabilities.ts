// Device detection for model-device policy. Two independent probes:
// WebGPU in the webview (Chromium, WebView2, recent WKWebView expose
// navigator.gpu; Linux webkitgtk does not or caps buffers at 1 GiB), and
// the native llama.cpp engine in the Rust process (desktop shells that
// compile it in — the Linux answer to the webkitgtk ceiling).

import { nativeProbe } from "@/app/utils/tauri";
import type { LlmDevice } from "./config";

interface NavigatorGpu {
    gpu?: {
        requestAdapter(): Promise<{
            features: Set<string> | { has(name: string): boolean };
            limits?: {
                maxBufferSize?: number;
                maxStorageBufferBindingSize?: number;
            };
        } | null>;
    };
}

export interface DeviceCapabilities {
    device: LlmDevice;
    /** shader-f16 lets WebGPU run the fp16 halves of q4f16 weights natively;
     *  without it transformers.js falls back to fp32 emulation (slower, more
     *  memory, still functional). Surfaced for the settings badge only. */
    shaderF16: boolean;
    /** Largest single GPU buffer the adapter can allocate AND bind:
     *  min(maxBufferSize, maxStorageBufferBindingSize). The prefill logits
     *  tensor (sequence x vocab, fp32) is one such buffer, so this limit
     *  bounds the usable context window (config.ts contextTokensFor).
     *  Undefined on WASM or when the adapter does not report limits. */
    maxBufferBytes?: number;
    /** The raw adapter numbers behind maxBufferBytes, for the load-time
     *  breadcrumb log only — OOM reports need to show which of the two
     *  limits governed. */
    bufferLimits?: {
        maxBufferSize: number;
        maxStorageBufferBindingSize: number;
    };
    /** True when the Rust process offers the llama.cpp engine (GGUF
     *  models, minDevice "native"). Independent of the webview probe —
     *  `device` still describes what the webview itself can run. */
    native?: boolean;
    /** What llama.cpp compiled in ("vulkan" or "cpu"); settings badge. */
    nativeBackend?: string;
}

let cached: Promise<DeviceCapabilities> | undefined;

const detect = async (): Promise<DeviceCapabilities> => {
    const probe = await nativeProbe();
    const native = probe?.available
        ? { native: true, nativeBackend: probe.backend }
        : {};
    try {
        const gpu = (navigator as NavigatorGpu).gpu;
        if (!gpu) {
            return { device: "wasm", shaderF16: false, ...native };
        }
        const adapter = await gpu.requestAdapter();
        if (!adapter) {
            return { device: "wasm", shaderF16: false, ...native };
        }
        const { maxBufferSize, maxStorageBufferBindingSize } =
            adapter.limits ?? {};
        const bufferLimits =
            maxBufferSize && maxStorageBufferBindingSize
                ? { maxBufferSize, maxStorageBufferBindingSize }
                : undefined;
        return {
            device: "webgpu",
            shaderF16: adapter.features.has("shader-f16"),
            maxBufferBytes: bufferLimits
                ? Math.min(
                      bufferLimits.maxBufferSize,
                      bufferLimits.maxStorageBufferBindingSize,
                  )
                : undefined,
            bufferLimits,
            ...native,
        };
    } catch {
        return { device: "wasm", shaderF16: false, ...native };
    }
};

/** Detect once per session; WebGPU availability cannot change mid-page. */
export const getDeviceCapabilities = (): Promise<DeviceCapabilities> => {
    if (!cached) {
        cached = detect();
    }
    return cached;
};
