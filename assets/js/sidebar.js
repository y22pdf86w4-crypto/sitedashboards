// ================== AUTENTICAÇÃO / CONTEXTO ==================
function getAuthData() {
  try {
    const raw = localStorage.getItem('orgdash_auth'); // <-- chave padrão
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[SIDEBAR] erro ao ler auth do localStorage:', e);
    return null;
  }
}

function getUsuarioLogado() {
  const auth = getAuthData();
  if (!auth || !auth.usuario || !auth.token) {
    return null;
  }
  return auth.usuario;
}

// Se não tiver login, redireciona para index.html
(function enforceAuth() {
  const usuario = getUsuarioLogado();
  if (!usuario) {
    window.location.href = '/index.html';
  } else {
    window.USUARIO_LOGADO = usuario; // deixa disponível para o resto do script
  }
})();

// ================== SIDEBAR EXISTENTE ==================
const sidebarElement = document.querySelector('.sidebar');
const togglerButton = document.querySelector('.sidebar-toggler');
const themeToggleBtn = document.querySelector('.theme-toggle-btn');
const logoIcon = document.getElementById('sidebarLogoIcon');
const logoText = document.getElementById('sidebarLogoText');

const LOGO_ICON_DARK = '../logo/VISYALICONEBRANCO.png';
const LOGO_ICON_LIGHT = '../logo/VISYALICONEPRETO.png';
const LOGO_TEXT_DARK = '../logo/VISYALLOGOBRANCA.png';
const LOGO_TEXT_LIGHT = '../logo/VISYALLOGOPRETA.png';

function applyTheme(theme) {
  const isLight = theme === 'light';
  if (!sidebarElement) return;

  sidebarElement.classList.toggle('light-theme', isLight);

  if (logoIcon) {
    logoIcon.src = isLight ? LOGO_ICON_LIGHT : LOGO_ICON_DARK;
  }
  if (logoText) {
    logoText.src = isLight ? LOGO_TEXT_LIGHT : LOGO_TEXT_DARK;
  }

  try {
    localStorage.setItem('visya-sidebar-theme', theme);
  } catch (e) {
    console.warn('[SIDEBAR] erro ao salvar tema:', e);
  }

  // avisa o parent para sincronizar tema do conteúdo
  if (window.parent) {
    window.parent.postMessage(
      {
        type: 'visya-sidebar-theme',
        theme: theme
      },
      '*'
    );
  }
}

function loadSavedTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem('visya-sidebar-theme');
  } catch (e) {
    console.warn('[SIDEBAR] erro ao ler tema:', e);
  }

  if (saved === 'light' || saved === 'dark') {
    applyTheme(saved);
  } else {
    applyTheme('dark');
  }
}

function toggleDropdown(dropdown, menu, isOpen) {
  dropdown.classList.toggle('open', isOpen);
  menu.style.height = isOpen ? menu.scrollHeight + 'px' : 0;
}

function closeAllDropdowns() {
  document
    .querySelectorAll('.dropdown-container.open')
    .forEach(openDropdown => {
      const menu = openDropdown.querySelector('.dropdown-menu');
      if (menu) {
        toggleDropdown(openDropdown, menu, false);
      }
    });
}

// dropdowns
document.querySelectorAll('.dropdown-toggle').forEach(dropdownToggle => {
  dropdownToggle.addEventListener('click', function (e) {
    e.preventDefault();

    const dropdown = dropdownToggle.closest('.dropdown-container');
    if (!dropdown) return;

    const menu = dropdown.querySelector('.dropdown-menu');
    if (!menu) return;

    const isOpen = dropdown.classList.contains('open');
    closeAllDropdowns();
    toggleDropdown(dropdown, menu, !isOpen);
  });
});

// collapse
if (togglerButton && sidebarElement) {
  togglerButton.addEventListener('click', function () {
    closeAllDropdowns();
    sidebarElement.classList.toggle('collapsed');

    if (window.parent) {
      window.parent.postMessage(
        {
          type: 'visya-sidebar-toggle',
          collapsed: sidebarElement.classList.contains('collapsed')
        },
        '*'
      );
    }
  });
}

// toggle tema
if (themeToggleBtn && sidebarElement) {
  themeToggleBtn.addEventListener('click', function () {
    const isLight = sidebarElement.classList.contains('light-theme');
    const nextTheme = isLight ? 'dark' : 'light';
    applyTheme(nextTheme);
  });
}

// tema inicial
loadSavedTheme();

// ================== MENU DINÂMICO A PARTIR DE usuario.telas ==================
function montarMenuUsuarios() {
  const usuario = window.USUARIO_LOGADO;
  if (!usuario) return;

  const telas = (usuario.telas || []).filter(t => t.ativo && t.podeVer);

  // Filtra só módulo "Usuários"
  const telasUsuarios = telas
    .filter(t => t.modulo === 'Usuários')
    .sort((a, b) => a.nome.localeCompare(b.nome));

  // Ajusta IDs conforme seu HTML:
  // <li class="dropdown-container" id="menu-usuarios">
  //   <a href="#" class="dropdown-toggle">...</a>
  //   <ul class="dropdown-menu" id="submenu-usuarios"></ul>
  // </li>
  const menuContainer = document.getElementById('menu-usuarios');
  const submenu = document.getElementById('submenu-usuarios');
  if (!menuContainer || !submenu) {
    console.warn('[SIDEBAR] menu de usuários não encontrado no HTML');
    return;
  }

  submenu.innerHTML = '';

  telasUsuarios.forEach(tela => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = tela.rota;
    a.textContent = tela.nome;
    li.appendChild(a);
    submenu.appendChild(li);
  });

  // Esconde o item "Usuários" inteiro se não tiver nenhuma tela
  if (!telasUsuarios.length) {
    menuContainer.style.display = 'none';
  } else {
    menuContainer.style.display = '';
  }
}

// chama depois que o DOM estiver pronto
document.addEventListener('DOMContentLoaded', montarMenuUsuarios);