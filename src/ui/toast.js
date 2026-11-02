let hideTimer = 0;

export function toast(message, duration = 1900) {
  const element = document.getElementById("toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("is-visible");
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    element.classList.remove("is-visible");
  }, duration);
}
