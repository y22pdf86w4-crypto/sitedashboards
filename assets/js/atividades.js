// Aplica tema inicial no layout com base no localStorage (mesma chave do sidebar)
function applyInitialThemeFromStorage() {
  let saved = null;
  try {
    saved = localStorage.getItem("visya-sidebar-theme");
  } catch (e) {
    console.warn("[LAYOUT] erro ao ler tema:", e);
  }

  const layout = document.querySelector(".layout");
  if (!layout) return;

  const theme = saved === "light" || saved === "dark" ? saved : "dark";

  layout.classList.remove("theme-light", "theme-dark");
  layout.classList.add(theme === "light" ? "theme-light" : "theme-dark");
}

// Escuta mensagens vindas do iframe da sidebar
window.addEventListener("message", function (event) {
  const data = event.data;
  if (!data) return;

  const layout = document.querySelector(".layout");
  if (!layout) return;

  // Collapse / expand
  if (data.type === "visya-sidebar-toggle") {
    if (data.collapsed) {
      layout.classList.add("sidebar-collapsed");
    } else {
      layout.classList.remove("sidebar-collapsed");
    }
  }

  // Mudança de tema disparada pelo sidebar
  if (data.type === "visya-sidebar-theme") {
    const theme = data.theme === "light" ? "light" : "dark";
    layout.classList.remove("theme-light", "theme-dark");
    layout.classList.add(theme === "light" ? "theme-light" : "theme-dark");
  }
});

document.addEventListener("DOMContentLoaded", function () {
  applyInitialThemeFromStorage();
});