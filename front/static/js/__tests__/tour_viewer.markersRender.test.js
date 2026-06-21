const { loadTourViewerModule } = require("./helpers");

describe("tour_viewer markers and render", () => {
  test("buildNavMarkers hides info markers without selected tour", () => {
    const api = loadTourViewerModule();
    const { state, buildNavMarkers } = api;
    state.selectedTourId = null;
    buildNavMarkers([
      { id: 1, type: "transition", target_point: 2, azimuth: 10, target_point_name: "B" },
      { id: 2, type: "info", azimuth: 20, label: "Info" },
    ]);
    expect(state.markers).toHaveLength(1);
    expect(state.markers[0].data.type).toBe("transition");
    expect(document.querySelectorAll(".tv-nav-marker")).toHaveLength(1);
  });

  test("buildNavMarkers hides cross-plan transitions outside facility mode", () => {
    const api = loadTourViewerModule();
    const { state, buildNavMarkers } = api;
    state.facilityId = null;
    buildNavMarkers([
      { id: 1, type: "transition", target_point: 2, azimuth: 10, target_plan_id: 1 },
      { id: 2, type: "transition", target_point: 3, azimuth: 20, target_plan_id: 99 },
    ]);
    expect(state.markers).toHaveLength(1);
    expect(state.markers[0].data.id).toBe(1);
  });

  test("resolveTargetPointInfoText prefers local point text", () => {
    const api = loadTourViewerModule();
    const { state, resolveTargetPointInfoText } = api;
    state.points = [{ id: 2, info_text: "локально" }];
    const text = resolveTargetPointInfoText({
      target_point: 2,
      target_point_info_text: "fallback",
    });
    expect(text).toBe("локально");
  });

  test("applyRender updates background position and marker coordinates", () => {
    const api = loadTourViewerModule();
    const { state, buildNavMarkers, recalcScaledTile, applyRender } = api;
    state.panoWidth = 3600;
    state.panoHeight = 1800;
    state.offsetPx = 180;
    state.viewportW = 800;
    recalcScaledTile();
    buildNavMarkers([{ id: 1, type: "transition", target_point: 2, azimuth: 90, pitch: 0 }]);
    applyRender();
    const panoEl = document.getElementById("tvPanoramaImage");
    expect(panoEl.style.backgroundPosition).toMatch(/px 50%/);
    const marker = document.querySelector(".tv-nav-marker");
    expect(marker.style.left).not.toBe("");
    expect(marker.style.top).not.toBe("");
  });

  test("applyRouteNavHighlights marks next transition marker", () => {
    const api = loadTourViewerModule();
    const { state, buildNavMarkers, applyRouteNavHighlights } = api;
    state.activePointId = 1;
    state.route = {
      endPointId: 2,
      path: [1, 2],
      steps: [{ from_point_id: 1, to_point_id: 2, marker_id: 10 }],
      deviation: "none",
    };
    buildNavMarkers([
      { id: 10, type: "transition", target_point: 2, azimuth: 0 },
      { id: 11, type: "transition", target_point: 3, azimuth: 45 },
    ]);
    applyRouteNavHighlights();
    const next = state.markers.find((m) => m.data.id === 10).el;
    const dim = state.markers.find((m) => m.data.id === 11).el;
    expect(next.classList.contains("is-route-next")).toBe(true);
    expect(dim.classList.contains("is-route-dim")).toBe(true);
  });
});
