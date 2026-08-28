// WebGPU detection for model-device policy. Chromium (web, WebView2) and
// recent WKWebView expose navigator.gpu; Linux webkitgtk does not, so those
// machines fall back to WASM and are limited to the lite model.

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
}

let cached: Promise<DeviceCapabilities> | undefined;

const detect = async (): Promise<DeviceCapabilities> => {
    try {
        const gpu = (navigator as NavigatorGpu).gpu;
        if (!gpu) {
            return { device: "wasm", shaderF16: false };
        }
        const adapter = await gpu.requestAdapter();
        if (!adapter) {
            return { device: "wasm", shaderF16: false };
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
        };
    } catch {
        return { device: "wasm", shaderF16: false };
    }
};

/** Detect once per session; WebGPU availability cannot change mid-page. */
export const getDeviceCapabilities = (): Promise<DeviceCapabilities> => {
    if (!cached) {
        cached = detect();
    }
    return cached;
};
