const { loadTourViewerModule } = require("./helpers");

describe("tour_viewer route state", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test("saveRouteToStorage and tryRestoreRouteFromStorage roundtrip", () => {
    const api = loadTourViewerModule();
    const { state, saveRouteToStorage, tryRestoreRouteFromStorage } = api;

    state.points = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 10, y: 10 }];
    state.route = {
      endPointId: 2,
      path: [1, 2],
      steps: [{ from_point_id: 1, to_point_id: 2, marker_id: 5 }],
      deviation: "none",
    };
    saveRouteToStorage();
    state.route = null;
    tryRestoreRouteFromStorage();
    expect(state.route.endPointId).toBe(2);
    expect(state.route.path).toEqual([1, 2]);
  });

  test("tryRestoreRouteFromStorage drops invalid path for plan mode", () => {
    const api = loadTourViewerModule();
    const { state, tryRestoreRouteFromStorage, routeStorageKey } = api;
    state.points = [{ id: 1, x: 0, y: 0 }];
    sessionStorage.setItem(routeStorageKey(), JSON.stringify({ endPointId: 9, path: [1, 99], steps: [] }));
    tryRestoreRouteFromStorage();
    expect(state.route).toBeNull();
  });

  test("applyRouteApiResult sets route and draws polyline", () => {
    const api = loadTourViewerModule();
    const { state, applyRouteApiResult, updateRoutePolyline } = api;
    state.points = [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 50, y: 50 },
    ];
    state.activePointId = 1;
    const ok = applyRouteApiResult({
      found: true,
      path: [1, 2],
      steps: [{ from_point_id: 1, to_point_id: 2, marker_id: 7 }],
    }, 2);
    expect(ok).toBe(true);
    updateRoutePolyline();
    const svg = document.getElementById("tvMinimapRoute");
    expect(svg.innerHTML).toContain("polyline");
  });

  test("validateMinimapAgainstRoute marks deviation on wrong step", () => {
    const api = loadTourViewerModule();
    const { state, validateMinimapAgainstRoute } = api;
    state.activePointId = 1;
    state.route = {
      endPointId: 3,
      path: [1, 2, 3],
      steps: [
        { from_point_id: 1, to_point_id: 2, marker_id: 10 },
        { from_point_id: 2, to_point_id: 3, marker_id: 11 },
      ],
      deviation: "none",
    };
    validateMinimapAgainstRoute(3);
    expect(state.route.deviation).toBe("blocked");
  });

  test("processPendingRouteNav accepts valid cross-plan step", () => {
    const api = loadTourViewerModule();
    const { state, processPendingRouteNav } = api;
    state.route = {
      endPointId: 2,
      path: [1, 2],
      steps: [{ from_point_id: 1, to_point_id: 2, marker_id: 5 }],
      deviation: "none",
    };
    state.pendingRouteNav = { fromId: 1, markerId: 5, toId: 2 };
    processPendingRouteNav();
    expect(state.route.deviation).toBe("none");
    expect(state.pendingRouteNav).toBeNull();
  });

  test("checkRouteArrival clears route at destination", () => {
    const api = loadTourViewerModule();
    const { state, checkRouteArrival } = api;
    state.activePointId = 2;
    state.points = [{ id: 2, x: 1, y: 1 }];
    state.route = { endPointId: 2, path: [1, 2], steps: [], deviation: "none" };
    checkRouteArrival();
    expect(state.route).toBeNull();
  });

  test("clearRoute resets status and polyline", () => {
    const api = loadTourViewerModule();
    const { state, clearRoute, setRouteDeviation } = api;
    state.points = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 1 }];
    state.activePointId = 1;
    state.route = { endPointId: 2, path: [1, 2], steps: [], deviation: "none" };
    setRouteDeviation("off route");
    clearRoute();
    expect(state.route).toBeNull();
    expect(document.getElementById("tvRouteStatus").textContent).toBe("");
    expect(document.getElementById("tvMinimapRoute").innerHTML).toBe("");
  });
});
