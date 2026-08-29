fn main() {
    // Windows + native-llm-vulkan: vulkan-1.dll ships with GPU drivers, not
    // Windows itself. A normal import would abort app LAUNCH on machines
    // without it (driverless VMs, remote desktop). Delay-loading defers
    // resolution to the first Vulkan call inside llama.cpp, which handles
    // the failure by running on CPU. MSVC-only flags — the GNU toolchain is
    // not a supported target here.
    if std::env::var_os("CARGO_FEATURE_NATIVE_LLM_VULKAN").is_some()
        && std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
    {
        println!("cargo:rustc-link-arg=/DELAYLOAD:vulkan-1.dll");
        println!("cargo:rustc-link-lib=delayimp");
    }
    tauri_build::build()
}
