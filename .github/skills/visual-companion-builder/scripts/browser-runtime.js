(function () {
  "use strict";
  const scriptUrl = document.currentScript && document.currentScript.src;
  function mount(root, definition) {
    if (!root || !definition || !Object.hasOwn(definition.animations, definition.defaultState)) {
      throw new Error("A companion root and validated definition are required.");
    }
    if (!scriptUrl) throw new Error("Load companion.js as a local external classic script.");
    const assets = new URL(".", scriptUrl);
    const make = (tag, text) => {
      const element = document.createElement(tag);
      if (text !== undefined) element.textContent = text;
      return element;
    };
    const heading = make("h2", definition.name);
    const stage = make("div");
    stage.className = "companion-stage";
    const fallback = make("img");
    fallback.src = new URL("static.png", assets).href;
    fallback.alt = definition.accessibility.altText;
    fallback.width = definition.sprite.frameWidth;
    fallback.height = definition.sprite.frameHeight;
    const canvas = make("canvas");
    canvas.width = definition.sprite.frameWidth;
    canvas.height = definition.sprite.frameHeight;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", definition.accessibility.altText);
    canvas.hidden = true;
    stage.append(fallback, canvas);
    const controls = make("div");
    controls.className = "companion-controls";
    const label = make("label", "Animation state ");
    const select = make("select");
    select.setAttribute("aria-label", "Animation state");
    for (const state of Object.keys(definition.animations)) {
      const option = make("option", state);
      option.value = state;
      select.append(option);
    }
    label.append(select);
    const pause = make("button", "Pause animation");
    pause.type = "button";
    pause.setAttribute("aria-pressed", "false");
    const status = make("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    controls.append(label, pause);
    root.replaceChildren(heading, stage, controls, status);
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const context = canvas.getContext("2d");
    if (context) context.imageSmoothingEnabled = false;
    const image = new Image();
    let state = definition.defaultState;
    let paused = false;
    let ready = false;
    let disposed = false;
    let raf = null;
    let started = 0;
    const still = definition.accessibility.staticFrame;
    function staticOnly() { return paused || media.matches || document.hidden; }
    function draw(index) {
      if (!context || !ready) return;
      const frame = definition.sprite.frames[index];
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, frame.x, frame.y, frame.width, frame.height, 0, 0, canvas.width, canvas.height);
    }
    function stop() {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    }
    function announce() {
      status.textContent = `State: ${state}${media.matches ? ". Reduced motion: static image." : paused ? ". Animation paused." : "."}`;
      select.value = state;
      pause.textContent = paused ? "Resume animation" : "Pause animation";
      pause.setAttribute("aria-pressed", String(paused));
    }
    function tick(time) {
      raf = null;
      if (disposed || !ready) return;
      if (staticOnly()) { draw(still); return; }
      const animation = definition.animations[state];
      const total = animation.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
      const elapsed = Math.max(0, time - started);
      let position = animation.loop ? elapsed % total : Math.min(elapsed, total - 1);
      let index = animation.frames[animation.frames.length - 1].index;
      for (const frame of animation.frames) {
        if (position < frame.durationMs) { index = frame.index; break; }
        position -= frame.durationMs;
      }
      draw(index);
      if (animation.loop || elapsed < total) raf = requestAnimationFrame(tick);
    }
    function restart() {
      stop();
      announce();
      started = performance.now();
      if (ready && context) {
        draw(staticOnly() ? still : definition.animations[state].frames[0].index);
        if (!staticOnly()) raf = requestAnimationFrame(tick);
      }
    }
    function setState(next) {
      if (!Object.hasOwn(definition.animations, next)) throw new Error("Unknown companion animation state.");
      if (disposed) throw new Error("Companion has been disposed.");
      state = next;
      restart();
    }
    function setPaused(next) {
      if (disposed) return;
      paused = Boolean(next);
      restart();
    }
    const change = () => setState(select.value);
    const toggle = () => setPaused(!paused);
    select.addEventListener("change", change);
    pause.addEventListener("click", toggle);
    media.addEventListener("change", restart);
    document.addEventListener("visibilitychange", restart);
    function dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      image.onload = null;
      image.onerror = null;
      select.removeEventListener("change", change);
      pause.removeEventListener("click", toggle);
      media.removeEventListener("change", restart);
      document.removeEventListener("visibilitychange", restart);
      removeEventListener("pagehide", dispose);
    }
    addEventListener("pagehide", dispose);
    image.onload = () => {
      if (disposed || !context) return;
      ready = true;
      fallback.hidden = true;
      canvas.hidden = false;
      restart();
    };
    image.onerror = () => {
      stop();
      ready = false;
      fallback.hidden = false;
      canvas.hidden = true;
      status.textContent = "Animation unavailable. Static companion image.";
    };
    announce();
    image.src = new URL("sprite.png", assets).href;
    return Object.freeze({ setState, getState: () => state, setPaused, dispose });
  }
  globalThis.VisualCompanion = Object.freeze({ mount });
  const root = document.getElementById("visual-companion");
  if (root && globalThis.VISUAL_COMPANION_DATA) mount(root, globalThis.VISUAL_COMPANION_DATA);
}());
