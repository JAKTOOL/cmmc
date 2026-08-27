// WebGPU detection for model-device policy. Chromium (web, WebView2) and
// recent WKWebView expose navigator.gpu; Linux webkitgtk does not, so those
// machines fall back to WASM and are limited to the lite model.

import type { LlmDevice } from "./config";

interface NavigatorGpu {
    gpu?: {
        requestAdapter(): Promise<{
            features: Set<string> | { has(name: string): boolean };
        } | null>;
    };
}

export interface DeviceCapabilities {
    device: LlmDevice;
    /** shader-f16 lets WebGPU run the fp16 halves of q4f16 weights natively;
     *  without it transformers.js falls back to fp32 emulation (slower, more
     *  memory, still functional). Surfaced for the settings badge only. */
    shaderF16: boolean;
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
        return { device: "webgpu", shaderF16: adapter.features.has("shader-f16") };
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
