//(function () {
  const defaultOverlay = document.getElementById("global-loader-overlay");
  const rotasOverlay = document.getElementById("rotas-loader-overlay");

  function internalShow(overlay) {
    if (!overlay) return;
    overlay.style.display = "flex"; // ou "block"
  }

  function internalHide(overlay) {
    if (!overlay) return;
    overlay.style.display = "none";
  }

  window.showLoader = function () {
    if (rotasOverlay) internalShow(rotasOverlay);
    else if (defaultOverlay) internalShow(defaultOverlay);
  };

  window.hideLoader = function () {
    if (rotasOverlay) internalHide(rotasOverlay);
    else if (defaultOverlay) internalHide(defaultOverlay);
  };
