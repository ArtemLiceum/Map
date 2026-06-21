function mountTourViewerDom(extra = "") {
  document.body.innerHTML = `
    <div id="tvPanorama">
      <div id="tvPanoramaImage"></div>
      <div id="tvNavMarkers"></div>
    </div>
    <div id="tvFade"></div>
    <div id="tvLoader"></div>
    <div id="tvMinimap">
      <img id="tvMinimapImage" />
      <div id="tvMinimapPoints"></div>
      <svg id="tvMinimapRoute"></svg>
      <button id="tvMinimapToggle"></button>
      <button id="tvMinimapZoomOut"></button>
      <button id="tvMinimapZoomIn"></button>
    </div>
    <div id="tvInfoOverlay"></div>
    <div id="tvInfoTitle"></div>
    <div id="tvInfoText"></div>
    <button id="tvInfoClose"></button>
    <select id="tvTourSelect"></select>
    <div id="tvTourProgress"></div>
    <div id="tvTourProgressTitle"></div>
    <div id="tvTourProgressText"></div>
    <div id="tvTourProgressBarFill"></div>
    <div id="tvRoutePanel"></div>
    <button id="tvRoutePanelToggle"></button>
    <select id="tvRouteStart"></select>
    <select id="tvRouteEnd"></select>
    <input id="tvRouteStartQuery" />
    <input id="tvRouteEndQuery" />
    <div id="tvRouteStartDropdown"></div>
    <div id="tvRouteEndDropdown"></div>
    <div id="tvRouteDeviation" class="hidden"></div>
    <div id="tvRouteDeviationText"></div>
    <div id="tvRouteStatus"></div>
    <div id="tvRouteToast" class="hidden"></div>
    ${extra}
  `;
  const container = document.getElementById("tvPanorama");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
}

function loadTourViewerModule() {
  jest.resetModules();
  mountTourViewerDom();
  window.TOUR_PLAN_ID = 1;
  window.IS_AUTH = false;
  window.IS_STAFF = false;
  window.__TOUR_VIEWER_TESTS__ = true;
  window.__TOUR_VIEWER_DISABLE_AUTO_INIT__ = true;
  global.requestAnimationFrame = (cb) => cb();
  class MockImage {
    constructor() {
      this.naturalWidth = 4000;
      this.naturalHeight = 2000;
      this.width = 4000;
      this.height = 2000;
      this.onload = null;
      this.onerror = null;
    }
    set src(_v) {
      if (typeof this.onload === "function") this.onload();
    }
  }
  global.Image = MockImage;
  require("../tour_viewer.js");
  return window.__tourViewerTest;
}

module.exports = { mountTourViewerDom, loadTourViewerModule };
