// Removes out/models after the static export. Next copies everything under
// public/ into out/, but the desktop shell must NOT embed the model weights:
// tauri's generate_context! compiles all of out/ into the binary, and
// gigabytes of weights there blow rustc's memory and the executable size.
// The weights reach the desktop app as bundle resources instead
// (tauri.conf.json "resources" -> resource_dir()/models, read over IPC by
// src-tauri's read_model_file). Runs as npm postbuild, cwd = client.
import { rmSync } from "node:fs";

rmSync("out/models", { recursive: true, force: true });
console.log("strip-model-assets: removed out/models (weights ship as Tauri resources)");
