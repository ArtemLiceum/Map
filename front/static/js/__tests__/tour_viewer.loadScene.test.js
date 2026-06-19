describe("tour_viewer loadScene()", () => {
  function mountDom() {
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
    `;

    const container = document.getElementById("tvPanorama");
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  }

  beforeEach(() => {
    jest.resetModules();
    mountDom();

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
  });

  test("sets pano background, updates state, hides loader/fade", async () => {
    jest.useFakeTimers();

    require("../tour_viewer.js");
    const { state, loadScene } = window.__tourViewerTest;

    state.points = [
      {
        id: 10,
        panorama: {
          image: "/media/pano.jpg",
          markers: [],
        },
      },
    ];

    await loadScene(10);

    expect(state.activePointId).toBe(10);
    expect(state.panoUrl).toBe("/media/pano.jpg");
    expect(state.panoWidth).toBe(4000);
    expect(state.panoHeight).toBe(2000);
    expect(state.offsetPx).toBe(0);
    expect(state.velocity).toBe(0);

    const panoEl = document.getElementById("tvPanoramaImage");
    expect(panoEl.style.backgroundImage).toBe('url("/media/pano.jpg")');

    // loader cleared
    const loaderEl = document.getElementById("tvLoader");
    expect(loaderEl.textContent).toBe("");
    expect(loaderEl.classList.contains("visible")).toBe(false);

    // fade removed after timeout
    const fadeEl = document.getElementById("tvFade");
    expect(fadeEl.classList.contains("active")).toBe(true);
    jest.advanceTimersByTime(60);
    expect(fadeEl.classList.contains("active")).toBe(false);

    jest.useRealTimers();
  });

  test("shows message when point has no panorama", async () => {
    require("../tour_viewer.js");
    const { state, loadScene } = window.__tourViewerTest;

    state.points = [{ id: 5, panorama: null }];

    await loadScene(5);

    const loaderEl = document.getElementById("tvLoader");
    expect(loaderEl.textContent).toBe("Для точки нет панорамы");
    expect(loaderEl.classList.contains("visible")).toBe(true);
  });
});

