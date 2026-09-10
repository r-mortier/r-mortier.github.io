class LoadingManager {
  constructor() {
    this.screen = document.getElementById("loading-screen");
    this.bar = document.getElementById("loading-progress-bar");
    this.percent = document.getElementById("loading-percent");
    this.status = document.getElementById("loading-status");
    this.main = document.querySelector("main");
    this.progress = 0;
    this.done = false;
    this.run();
  }

  setProgress(value, text) {
    this.progress = value;
    if (this.bar) this.bar.style.width = `${value}%`;
    if (this.percent) this.percent.textContent = `${value}%`;
    if (this.status && text) this.status.textContent = text;
  }

  run() {
    const steps = [[25, "Loading local profile..."], [55, "Building your mix..."], [80, "Setting the mood..."], [100, "Ready."]];
    steps.forEach(([progress, text], index) => setTimeout(() => this.setProgress(progress, text), index * 180));
    setTimeout(() => this.complete(), 800);
  }

  complete() {
    if (this.done) return;
    this.done = true;
    this.main?.classList.add("fade-in");
    this.screen?.classList.add("slide-up");
    setTimeout(() => {
      if (this.screen) this.screen.style.display = "none";
      document.dispatchEvent(new CustomEvent("loadingComplete"));
    }, 650);
  }
}
document.addEventListener("DOMContentLoaded", () => { window.loadingManager = new LoadingManager(); });
