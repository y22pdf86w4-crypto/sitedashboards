// inicio.js
window.addEventListener("DOMContentLoaded", () => {
  const user =
    typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;

  if (!user) {
    window.location.href = "../index.html";
    return;
  }

  const heroNome = document.getElementById("inicioHeroNome");
  if (heroNome) {
    const base = user.nome || user.email || "Usuário";
    heroNome.textContent = base.split(" ")[0]; // primeiro nome
  }

  try {
    const key = "visya-inicio-toast-" + new Date().toISOString().slice(0, 10);
    if (!localStorage.getItem(key)) {
      mostrarToastInicio(
        "Bem-vindo(a) à página inicial. Use os atalhos para ganhar tempo."
      );
      localStorage.setItem(key, "1");
    }
  } catch (e) {}
});

function mostrarToastInicio(mensagem) {
  const toast = document.getElementById("toastInicio");
  const span = document.getElementById("toastInicioMsg");
  if (!toast || !span) return;
  span.textContent = mensagem;
  toast.classList.add("toast-ano-visible");
  toast.setAttribute("aria-hidden", "false");
  setTimeout(() => {
    toast.classList.remove("toast-ano-visible");
    toast.setAttribute("aria-hidden", "true");
  }, 2600);
}