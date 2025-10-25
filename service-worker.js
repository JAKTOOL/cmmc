if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(
    `/sw.js?${process.env.NEXT_PUBLIC_FRAMEWORK_VERSION}`
  );
}
