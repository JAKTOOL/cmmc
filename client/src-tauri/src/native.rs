// Native inference engine: llama.cpp in the Rust process, behind the same
// message shapes the in-webview worker speaks (docs/native-inference-plan.md).
// This exists because Linux webkitgtk caps WebGPU below a usable window;
// running inference here reaches the GPU directly — Vulkan on Linux, Metal
// on Apple Silicon.
//
// Transport contract (client/src/app/llm/native_worker.ts polls, no events):
//   native_probe               -> { available, backend } (never fails)
//   native_load(path, nCtx)    -> blocks until the model is resident
//   native_generate({...})     -> blocks until generation ends; returns
//                                 { text, tokens, ms }; rejects with
//                                 { message, fatal }
//   native_poll(requestId)     -> { loadProgress, chunks } (chunks drain)
//   native_abort(requestId)    -> cooperative cancel; the generation then
//                                 completes normally with partial text
//   native_unload              -> frees the model and context
//
// The llama.cpp dependency is optional (feature "native-llm", Linux and
// macOS): default builds compile the stub bodies, so `cargo check` and
// Windows never build llama.cpp. The Nix package enables
// "native-llm-vulkan"; the aarch64 macOS CI leg enables
// "native-llm-metal" (Apple Silicon only — ggml-metal does not support
// Intel Macs, which stay on the webview path).

use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NativeProbe {
    pub available: bool,
    pub backend: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePoll {
    pub load_progress: f32,
    pub chunks: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGenerated {
    pub text: String,
    pub tokens: u32,
    pub ms: u64,
}

/// Command failures the transport maps onto the worker "error" message.
/// fatal mirrors the webview worker's contract: true when the session can
/// no longer be trusted, so the engine disposes the transport and reloads.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeError {
    pub message: String,
    pub fatal: bool,
}

#[cfg(all(feature = "native-llm", any(target_os = "linux", target_os = "macos")))]
mod imp {
    use super::{NativeError, NativeGenerated};
    use std::num::NonZeroU32;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
    use std::sync::{mpsc, Arc, Mutex, OnceLock};
    use std::time::Instant;

    use llama_cpp_2::context::params::LlamaContextParams;
    use llama_cpp_2::llama_backend::LlamaBackend;
    use llama_cpp_2::llama_batch::LlamaBatch;
    use llama_cpp_2::model::params::LlamaModelParams;
    use llama_cpp_2::model::{AddBos, LlamaChatMessage, LlamaModel, Special};
    use llama_cpp_2::sampling::LlamaSampler;

    // Mirrors the webview worker: greedy decoding with a mild repetition
    // penalty (worker.ts generate: do_sample false, repetition_penalty 1.1).
    const REPEAT_PENALTY: f32 = 1.1;
    const REPEAT_LAST_N: i32 = 64;
    // Prefill in bounded slices; llama.cpp's default n_batch is 512 and a
    // larger single decode is rejected.
    const PREFILL_CHUNK: usize = 512;

    pub struct ChatTurn {
        pub role: String,
        pub content: String,
    }

    /// State shared between the tauri commands and the inference thread.
    /// One generation at a time (the engine enforces it), so single-slot.
    #[derive(Default)]
    pub struct Shared {
        pub load_progress: Mutex<f32>,
        pub chunks: Mutex<Vec<String>>,
        pub active_request: AtomicI64,
        pub abort: AtomicBool,
    }

    pub enum Cmd {
        Load {
            path: PathBuf,
            n_ctx: u32,
            done: mpsc::Sender<Result<(), String>>,
        },
        Generate {
            request_id: i64,
            messages: Vec<ChatTurn>,
            max_new_tokens: usize,
            context_tokens: usize,
            done: mpsc::Sender<Result<NativeGenerated, NativeError>>,
        },
        Unload,
    }

    pub struct Handle {
        pub tx: mpsc::Sender<Cmd>,
        pub shared: Arc<Shared>,
    }

    static HANDLE: OnceLock<Handle> = OnceLock::new();

    pub fn handle() -> &'static Handle {
        HANDLE.get_or_init(|| {
            let (tx, rx) = mpsc::channel::<Cmd>();
            let shared = Arc::new(Shared::default());
            let thread_shared = shared.clone();
            // The llama model and context hold raw pointers; they live and
            // die on this one thread, and commands cross via the channel.
            std::thread::Builder::new()
                .name("native-llm".into())
                .spawn(move || run(rx, thread_shared))
                .expect("spawn native-llm thread");
            Handle { tx, shared }
        })
    }

    struct Loaded {
        model: LlamaModel,
        ctx_tokens: u32,
    }

    fn run(rx: mpsc::Receiver<Cmd>, shared: Arc<Shared>) {
        let backend = match LlamaBackend::init() {
            Ok(backend) => backend,
            Err(err) => {
                eprintln!("[ai] native: backend init failed: {err}");
                return;
            }
        };
        let mut loaded: Option<Loaded> = None;

        while let Ok(cmd) = rx.recv() {
            match cmd {
                Cmd::Load { path, n_ctx, done } => {
                    *shared.load_progress.lock().unwrap() = 0.0;
                    loaded = None;
                    let result = load(&backend, &path, n_ctx).map(|l| {
                        loaded = Some(l);
                    });
                    *shared.load_progress.lock().unwrap() = 1.0;
                    let _ = done.send(result);
                }
                Cmd::Generate {
                    request_id,
                    messages,
                    max_new_tokens,
                    context_tokens,
                    done,
                } => {
                    shared.chunks.lock().unwrap().clear();
                    shared.abort.store(false, Ordering::SeqCst);
                    shared.active_request.store(request_id, Ordering::SeqCst);
                    let result = match loaded.as_ref() {
                        Some(loaded) => generate(
                            &backend,
                            loaded,
                            &shared,
                            messages,
                            max_new_tokens,
                            context_tokens,
                        ),
                        None => Err(NativeError {
                            message: "no model loaded".into(),
                            fatal: true,
                        }),
                    };
                    shared.active_request.store(0, Ordering::SeqCst);
                    let _ = done.send(result);
                }
                Cmd::Unload => {
                    loaded = None;
                    *shared.load_progress.lock().unwrap() = 0.0;
                }
            }
        }
    }

    fn load(
        backend: &LlamaBackend,
        path: &PathBuf,
        n_ctx: u32,
    ) -> Result<Loaded, String> {
        // GPU builds (Vulkan, Metal) offload every layer; the CPU build
        // ignores this.
        let params = LlamaModelParams::default().with_n_gpu_layers(1_000_000);
        let model = LlamaModel::load_from_file(backend, path, &params)
            .map_err(|err| format!("model load failed: {err}"))?;
        Ok(Loaded {
            model,
            ctx_tokens: n_ctx,
        })
    }

    /// Trim like the webview worker (worker.ts generate): re-template and
    /// cut the largest message until the token count fits the input
    /// budget. Chat-template overhead is constant, so this converges fast.
    fn templated_tokens(
        model: &LlamaModel,
        messages: &mut [ChatTurn],
        input_budget: usize,
    ) -> Result<Vec<llama_cpp_2::token::LlamaToken>, String> {
        let template = model
            .chat_template(None)
            .map_err(|err| format!("chat template unavailable: {err}"))?;
        for _pass in 0..3 {
            let chat: Vec<LlamaChatMessage> = messages
                .iter()
                .map(|turn| {
                    LlamaChatMessage::new(turn.role.clone(), turn.content.clone())
                        .map_err(|err| err.to_string())
                })
                .collect::<Result<_, String>>()?;
            let prompt = model
                .apply_chat_template(&template, &chat, true)
                .map_err(|err| format!("chat template failed: {err}"))?;
            // The template writes special tokens (<|start_header_id|>...)
            // as text and already includes BOS.
            let tokens = model
                .str_to_token(&prompt, AddBos::Never)
                .map_err(|err| format!("tokenize failed: {err}"))?;
            if tokens.len() <= input_budget {
                return Ok(tokens);
            }
            let excess = tokens.len() - input_budget;
            let largest = messages
                .iter_mut()
                .max_by_key(|turn| turn.content.len())
                .ok_or("no messages")?;
            let cut = (excess + 64) * 6;
            let keep = largest.content.len().saturating_sub(cut);
            // Cut on a char boundary; floor stays at zero content.
            let keep = largest
                .content
                .char_indices()
                .map(|(i, _)| i)
                .take_while(|i| *i <= keep)
                .last()
                .unwrap_or(0);
            largest.content.truncate(keep);
        }
        Err("prompt does not fit the context window".into())
    }

    fn generate(
        backend: &LlamaBackend,
        loaded: &Loaded,
        shared: &Shared,
        mut messages: Vec<ChatTurn>,
        max_new_tokens: usize,
        context_tokens: usize,
    ) -> Result<NativeGenerated, NativeError> {
        let fatal = |message: String| NativeError {
            message,
            fatal: true,
        };
        let soft = |message: String| NativeError {
            message,
            fatal: false,
        };

        let n_ctx = (loaded.ctx_tokens as usize).min(context_tokens.max(1));
        let input_budget = n_ctx.saturating_sub(max_new_tokens).max(16);
        let tokens =
            templated_tokens(&loaded.model, &mut messages, input_budget)
                .map_err(soft)?;

        // A fresh context per request: no KV state survives between
        // generations, matching the webview worker's behavior.
        let ctx_params = LlamaContextParams::default()
            .with_n_ctx(NonZeroU32::new(loaded.ctx_tokens))
            .with_n_batch(PREFILL_CHUNK as u32);
        let mut ctx = loaded
            .model
            .new_context(backend, ctx_params)
            .map_err(|err| fatal(format!("context creation failed: {err}")))?;

        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::penalties(REPEAT_LAST_N, REPEAT_PENALTY, 0.0, 0.0),
            LlamaSampler::greedy(),
        ]);

        let started = Instant::now();
        // Prefill in n_batch-sized slices; only the last position needs
        // logits.
        let mut batch = LlamaBatch::new(PREFILL_CHUNK, 1);
        let mut pos: i32 = 0;
        for chunk in tokens.chunks(PREFILL_CHUNK) {
            batch.clear();
            let chunk_end = pos as usize + chunk.len() == tokens.len();
            for (i, token) in chunk.iter().enumerate() {
                let last = chunk_end && i == chunk.len() - 1;
                batch
                    .add(*token, pos, &[0], last)
                    .map_err(|err| fatal(format!("batch add failed: {err}")))?;
                pos += 1;
            }
            ctx.decode(&mut batch)
                .map_err(|err| fatal(format!("prefill decode failed: {err}")))?;
        }

        let mut text = String::new();
        // Detokenized bytes can split UTF-8 sequences across tokens; hold
        // the incomplete tail until the next token completes it.
        let mut pending: Vec<u8> = Vec::new();
        let mut produced: u32 = 0;

        while (produced as usize) < max_new_tokens {
            if shared.abort.load(Ordering::SeqCst) {
                // Cooperative stop: the partial text is the result, same
                // as the webview worker's interruptable stopping criteria.
                break;
            }
            let token = sampler.sample(&ctx, batch.n_tokens() - 1);
            sampler.accept(token);
            if loaded.model.is_eog_token(token) {
                break;
            }
            let bytes = loaded
                .model
                .token_to_bytes(token, Special::Tokenize)
                .map_err(|err| fatal(format!("detokenize failed: {err}")))?;
            pending.extend_from_slice(&bytes);
            let valid = match std::str::from_utf8(&pending) {
                Ok(_) => pending.len(),
                Err(err) => err.valid_up_to(),
            };
            if valid > 0 {
                let piece =
                    String::from_utf8_lossy(&pending[..valid]).into_owned();
                text.push_str(&piece);
                shared.chunks.lock().unwrap().push(piece);
                pending.drain(..valid);
            }
            produced += 1;

            batch.clear();
            batch
                .add(token, pos, &[0], true)
                .map_err(|err| fatal(format!("batch add failed: {err}")))?;
            pos += 1;
            ctx.decode(&mut batch)
                .map_err(|err| fatal(format!("decode failed: {err}")))?;
        }

        Ok(NativeGenerated {
            text,
            tokens: produced,
            ms: started.elapsed().as_millis() as u64,
        })
    }
}

#[cfg(all(feature = "native-llm", any(target_os = "linux", target_os = "macos")))]
fn resolve_model_path(
    app: &tauri::AppHandle,
    path: &str,
) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    // Same containment rules as read_model_file: relative, forward-slash
    // manifest paths only.
    let valid = !path.is_empty()
        && !path.contains('\\')
        && !path.starts_with('/')
        && path
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..");
    if !valid {
        return Err(format!("invalid model path: {path}"));
    }
    Ok(app
        .path()
        .resource_dir()
        .map_err(|err| err.to_string())?
        .join("models")
        .join(path))
}

#[tauri::command]
pub async fn native_probe() -> NativeProbe {
    #[cfg(all(feature = "native-llm", any(target_os = "linux", target_os = "macos")))]
    {
        // Touch the engine thread so backend-init failures surface here
        // (probe stays infallible; a dead thread means no native path).
        let _ = imp::handle();
        NativeProbe {
            available: true,
            backend: if cfg!(feature = "native-llm-vulkan") {
                "vulkan"
            } else if cfg!(feature = "native-llm-metal") {
                "metal"
            } else {
                "cpu"
            },
        }
    }
    #[cfg(not(all(feature = "native-llm", any(target_os = "linux", target_os = "macos"))))]
    {
        NativeProbe {
            available: false,
            backend: "cpu",
        }
    }
}

#[cfg(all(feature = "native-llm", any(target_os = "linux", target_os = "macos")))]
#[tauri::command]
pub async fn native_load(
    app: tauri::AppHandle,
    path: String,
    n_ctx: u32,
) -> Result<(), String> {
    let file = resolve_model_path(&app, &path)?;
    if !file.exists() {
        return Err(format!("model file missing: {path}"));
    }
    let (done, rx) = std::sync::mpsc::channel();
    imp::handle()
        .tx
        .send(imp::Cmd::Load {
            path: file,
            n_ctx,
            done,
        })
        .map_err(|_| "native engine thread is gone".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        rx.recv()
            .unwrap_or_else(|_| Err("native engine thread is gone".into()))
    })
    .await
    .map_err(|err| err.to_string())?
}

#[cfg(all(feature = "native-llm", any(target_os = "linux", target_os = "macos")))]
#[tauri::command]
pub async fn native_generate(
    request_id: i64,
    messages: Vec<serde_json::Value>,
    max_new_tokens: usize,
    context_tokens: usize,
) -> Result<NativeGenerated, NativeError> {
    let turns: Vec<imp::ChatTurn> = messages
        .iter()
        .map(|message| imp::ChatTurn {
            role: message["role"].as_str().unwrap_or("user").to_string(),
            content: message["content"].as_str().unwrap_or("").to_string(),
        })
        .collect();
    let (done, rx) = std::sync::mpsc::channel();
    imp::handle()
        .tx
        .send(imp::Cmd::Generate {
            request_id,
            messages: turns,
            max_new_tokens,
            context_tokens,
            done,
        })
        .map_err(|_| NativeError {
            message: "native engine thread is gone".into(),
            fatal: true,
        })?;
    tauri::async_runtime::spawn_blocking(move || {
        rx.recv().unwrap_or_else(|_| {
            Err(NativeError {
                message: "native engine thread is gone".into(),
                fatal: true,
            })
        })
    })
    .await
    .map_err(|err| NativeError {
        message: err.to_string(),
        fatal: true,
    })?
}

#[cfg(all(feature = "native-llm", any(target_os = "linux", target_os = "macos")))]
#[tauri::command]
pub async fn native_poll(request_id: i64) -> NativePoll {
    let shared = &imp::handle().shared;
    let load_progress = *shared.load_progress.lock().unwrap();
    // Chunks belong to the active request; a stale poll (previous request)
    // gets nothing rather than another request's text.
    let chunks = if request_id
        == shared
            .active_request
            .load(std::sync::atomic::Ordering::SeqCst)
    {
        std::mem::take(&mut *shared.chunks.lock().unwrap())
    } else {
        Vec::new()
    };
    NativePoll {
        load_progress,
        chunks,
    }
}

#[cfg(all(feature = "native-llm", any(target_os = "linux", target_os = "macos")))]
#[tauri::command]
pub async fn native_abort(request_id: i64) {
    let shared = &imp::handle().shared;
    if request_id
        == shared
            .active_request
            .load(std::sync::atomic::Ordering::SeqCst)
    {
        shared
            .abort
            .store(true, std::sync::atomic::Ordering::SeqCst);
    }
}

#[cfg(all(feature = "native-llm", any(target_os = "linux", target_os = "macos")))]
#[tauri::command]
pub async fn native_unload() {
    let _ = imp::handle().tx.send(imp::Cmd::Unload);
}

// Stubs so the invoke handlers exist on every build; the frontend probes
// first and never calls these when available is false, but a stray call
// must fail cleanly instead of panicking on a missing command.
#[cfg(not(all(feature = "native-llm", any(target_os = "linux", target_os = "macos"))))]
#[tauri::command]
pub async fn native_load(_path: String, _n_ctx: u32) -> Result<(), String> {
    Err("native inference is not available in this build".into())
}

#[cfg(not(all(feature = "native-llm", any(target_os = "linux", target_os = "macos"))))]
#[tauri::command]
pub async fn native_generate(
    _request_id: i64,
) -> Result<NativeGenerated, NativeError> {
    Err(NativeError {
        message: "native inference is not available in this build".into(),
        fatal: true,
    })
}

#[cfg(not(all(feature = "native-llm", any(target_os = "linux", target_os = "macos"))))]
#[tauri::command]
pub async fn native_poll(_request_id: i64) -> NativePoll {
    NativePoll {
        load_progress: 0.0,
        chunks: Vec::new(),
    }
}

#[cfg(not(all(feature = "native-llm", any(target_os = "linux", target_os = "macos"))))]
#[tauri::command]
pub async fn native_abort(_request_id: i64) {}

#[cfg(not(all(feature = "native-llm", any(target_os = "linux", target_os = "macos"))))]
#[tauri::command]
pub async fn native_unload() {}
