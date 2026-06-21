const { loadTourViewerModule } = require("./helpers");

describe("tour_viewer ui helpers", () => {
  test("setLoader and toggleFade update DOM classes", () => {
    const api = loadTourViewerModule();
    const { setLoader, toggleFade } = api;
    setLoader("Загрузка...", true);
    const loader = document.getElementById("tvLoader");
    expect(loader.textContent).toBe("Загрузка...");
    expect(loader.classList.contains("visible")).toBe(true);

    toggleFade(true);
    expect(document.getElementById("tvFade").classList.contains("active")).toBe(true);
    toggleFade(false);
    expect(document.getElementById("tvFade").classList.contains("active")).toBe(false);
  });

  test("showInfoOverlay and hideInfoOverlay toggle overlay", () => {
    const api = loadTourViewerModule();
    const { showInfoOverlay, hideInfoOverlay } = api;
    showInfoOverlay({ label: "Заголовок", text: "Текст" });
    const overlay = document.getElementById("tvInfoOverlay");
    expect(overlay.classList.contains("visible")).toBe(true);
    expect(document.getElementById("tvInfoTitle").textContent).toBe("Заголовок");
    hideInfoOverlay();
    expect(overlay.classList.contains("visible")).toBe(false);
  });

  test("renderTourProgress shows selected tour stats", () => {
    const api = loadTourViewerModule();
    const { state, renderTourProgress } = api;
    state.tours = [
      { id: 5, title: "Экскурсия", progress_viewed: 2, progress_total: 4, progress_percent: 50, is_active: true },
    ];
    state.selectedTourId = 5;
    renderTourProgress();
    const wrap = document.getElementById("tvTourProgress");
    expect(wrap.classList.contains("hidden")).toBe(false);
    expect(document.getElementById("tvTourProgressText").textContent).toContain("50%");
    expect(document.getElementById("tvTourProgressBarFill").style.width).toBe("50%");
  });

  test("populateRouteSelects fills start/end options", () => {
    const api = loadTourViewerModule();
    const { state, populateRouteSelects } = api;
    state.points = [
      { id: 1, name: "A", x: 0, y: 0 },
      { id: 2, name: "B", x: 10, y: 10 },
    ];
    state.activePointId = 1;
    populateRouteSelects();
    const start = document.getElementById("tvRouteStart");
    const end = document.getElementById("tvRouteEnd");
    expect(start.options.length).toBe(2);
    expect(end.options.length).toBe(2);
    expect(start.value).toBe("1");
    expect(end.value).toBe("2");
  });
});
