describe("tour_viewer loadScene()", () => {
  const { loadTourViewerModule } = require("./helpers");

  test("sets pano background, updates state, hides loader/fade", async () => {
    const { state, loadScene } = loadTourViewerModule();

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
    expect(panoEl.style.backgroundImage).toContain("/media/pano.jpg");

    // loader cleared
    const loaderEl = document.getElementById("tvLoader");
    expect(loaderEl.textContent).toBe("");
    expect(loaderEl.classList.contains("visible")).toBe(false);

    // blocking fade stays disabled in crossfade mode
    const fadeEl = document.getElementById("tvFade");
    expect(fadeEl.classList.contains("active")).toBe(false);
  });

  test("shows message when point has no panorama", async () => {
    const { state, loadScene } = loadTourViewerModule();

    state.points = [{ id: 5, panorama: null }];

    await loadScene(5);

    const loaderEl = document.getElementById("tvLoader");
    expect(loaderEl.textContent).toBe("Для точки нет панорамы");
    expect(loaderEl.classList.contains("visible")).toBe(true);
  });

  test("keeps previous pano in fade layer during crossfade", async () => {
    const { state, loadScene } = loadTourViewerModule();
    const panoEl = document.getElementById("tvPanoramaImage");
    panoEl.style.backgroundImage = 'url("/media/prev.jpg")';
    state.panoUrl = "/media/prev.jpg";
    state.points = [
      {
        id: 11,
        panorama: {
          image: "/media/next.jpg",
          markers: [],
        },
      },
    ];

    await loadScene(11);

    const fadePanoEl = document.getElementById("tvPanoramaImageFade");
    expect(panoEl.style.backgroundImage).toContain("/media/next.jpg");
    expect(fadePanoEl.style.backgroundImage).toContain("/media/prev.jpg");
    expect(fadePanoEl.style.opacity).toBe("0");
  });
});

