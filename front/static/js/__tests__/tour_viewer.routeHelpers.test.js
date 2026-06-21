describe("tour_viewer route helpers", () => {
  const { loadTourViewerModule } = require("./helpers");

  test("normalizeRouteSearch collapses whitespace and lowercases", () => {
    const { normalizeRouteSearch } = loadTourViewerModule();
    expect(normalizeRouteSearch("  Hall   A ")).toBe("hall a");
    expect(normalizeRouteSearch(null)).toBe("");
  });

  test("routeTokens splits normalized query", () => {
    const { routeTokens } = loadTourViewerModule();
    expect(routeTokens("  foo   bar ")).toEqual(["foo", "bar"]);
    expect(routeTokens("   ")).toEqual([]);
  });

  test("routePointLabel uses facility format when facilityId set", () => {
    const { state, routePointLabel } = loadTourViewerModule();
    state.facilityId = 5;
    const label = routePointLabel({
      id: 3,
      name: "Лифт",
      plan_title: "Этаж 2",
      plan_floor: 2,
    });
    expect(label).toBe("Лифт — Этаж 2 (этаж 2)");
  });

  test("routePointMeta truncates long info text", () => {
    const { routePointMeta } = loadTourViewerModule();
    const long = "а".repeat(100);
    expect(routePointMeta({ info_text: long }).endsWith("…")).toBe(true);
    expect(routePointMeta({ info_text: "коротко" })).toBe("коротко");
  });

  test("searchRoutePoints ranks name matches higher than info matches", () => {
    const { searchRoutePoints } = loadTourViewerModule();
    const points = [
      { id: 1, name: "Коридор", info_text: "библиотека рядом" },
      { id: 2, name: "Библиотека", info_text: "" },
    ];
    const results = searchRoutePoints(points, "библиотека");
    expect(results[0].point.id).toBe(2);
    expect(results[0].matchedField).toBe("name");
  });

  test("clamp limits value to range", () => {
    const { clamp } = loadTourViewerModule();
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });

  test("azimuthToPx converts degrees to pixels", () => {
    const { state, azimuthToPx } = loadTourViewerModule();
    state.tileWidth = 360;
    expect(azimuthToPx(90)).toBe(90);
    expect(azimuthToPx(360)).toBe(0);
  });

  test("pickInitialPointId prefers URL point, then plan start, then panorama", () => {
    const { state, pickInitialPointId } = loadTourViewerModule();
    const points = [
      { id: 1, panorama: null },
      { id: 2, panorama: { image: "/a.jpg" } },
      { id: 3, panorama: { image: "/b.jpg" } },
    ];

    state.startPointParam = 1;
    expect(pickInitialPointId(points)).toBe(1);

    state.startPointParam = 99;
    state.plan = { start_point: 3 };
    expect(pickInitialPointId(points)).toBe(3);

    state.plan = { start_point: 99 };
    expect(pickInitialPointId(points)).toBe(2);
  });

  test("pending route nav storage roundtrip", () => {
    const { state, savePendingRouteNavToStorage, tryRestorePendingRouteNavFromStorage, clearPendingRouteNavStorage } = loadTourViewerModule();
    state.facilityId = 42;
    sessionStorage.clear();

    savePendingRouteNavToStorage({ fromId: 1, markerId: 2, toId: 3, entryAzimuth: 45 });
    expect(tryRestorePendingRouteNavFromStorage()).toEqual({
      fromId: 1,
      markerId: 2,
      toId: 3,
      entryAzimuth: 45,
    });

    clearPendingRouteNavStorage();
    expect(tryRestorePendingRouteNavFromStorage()).toBeNull();
  });

  test("findReverseAzimuth returns opposite direction of back-transition marker", () => {
    const { state, findReverseAzimuth } = loadTourViewerModule();
    state.points = [
      {
        id: 10,
        panorama: {
          markers: [
            { type: "transition", target_point: 5, azimuth: 30 },
          ],
        },
      },
    ];
    expect(findReverseAzimuth(10, 5)).toBe(210);
    expect(findReverseAzimuth(10, null)).toBeNull();
  });
});
