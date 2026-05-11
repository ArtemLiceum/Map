"""
Shortest path on the directed transition graph for an evacuation plan.

Vertices: MapPoint ids. Edges: PanoramaMarker (type=transition) from
panorama.point_id to target_point_id.
"""
from __future__ import annotations

from collections import defaultdict, deque
from typing import Any

from map_api.models import MapPoint, PanoramaMarker


def transition_edges_for_plan(plan_id: int) -> list[tuple[int, int, int]]:
    """
    Returns list of (from_point_id, to_point_id, marker_id), deterministic order
    (marker id ascending) for stable BFS tie-breaking.
    """
    rows = (
        PanoramaMarker.objects.filter(
            panorama__point__plan_id=plan_id,
            type=PanoramaMarker.MarkerType.TRANSITION,
            target_point_id__isnull=False,
        )
        .values_list("panorama__point_id", "target_point_id", "id")
        .order_by("id")
    )
    return [(int(a), int(b), int(m)) for a, b, m in rows]


def build_adjacency(
    edges: list[tuple[int, int, int]],
) -> dict[int, list[tuple[int, int]]]:
    """from_point -> [(to_point, marker_id), ...] sorted by marker_id."""
    adj: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for from_id, to_id, marker_id in edges:
        adj[from_id].append((to_id, marker_id))
    for from_id in adj:
        adj[from_id].sort(key=lambda t: t[1])
    return adj


def bfs_shortest_route(
    adj: dict[int, list[tuple[int, int]]], start: int, end: int
) -> tuple[list[int], list[dict[str, int]]]:
    """
    Returns (path, steps). path is [start, ..., end]; steps[i] is the edge
    from path[i] to path[i+1]. Empty path/steps if unreachable (and start != end).
    """
    if start == end:
        return [start], []

    prev_node: dict[int, int] = {}
    prev_marker: dict[int, int] = {}
    visited = {start}
    q: deque[int] = deque([start])

    while q:
        u = q.popleft()
        for v, marker_id in adj.get(u, ()):
            if v in visited:
                continue
            visited.add(v)
            prev_node[v] = u
            prev_marker[v] = marker_id
            if v == end:
                return _reconstruct_route(start, end, prev_node, prev_marker)
            q.append(v)

    return [], []


def _reconstruct_route(
    start: int,
    end: int,
    prev_node: dict[int, int],
    prev_marker: dict[int, int],
) -> tuple[list[int], list[dict[str, int]]]:
    nodes: list[int] = []
    cur = end
    while cur != start:
        nodes.append(cur)
        cur = prev_node[cur]
    nodes.append(start)
    nodes.reverse()
    steps: list[dict[str, int]] = []
    for i in range(len(nodes) - 1):
        a, b = nodes[i], nodes[i + 1]
        steps.append(
            {
                "from_point_id": a,
                "to_point_id": b,
                "marker_id": prev_marker[b],
            }
        )
    return nodes, steps


def bfs_shortest_route_to_any_end(
    adj: dict[int, list[tuple[int, int]]],
    start: int,
    ends: set[int],
) -> tuple[list[int], list[dict[str, int]], int | None]:
    """
    Shortest path from start to any vertex in ``ends`` (unweighted).
    Returns (path, steps, end_reached); path/steps empty and end_reached None if unreachable.
    """
    if not ends:
        return [], [], None
    if start in ends:
        return [start], [], start

    prev_node: dict[int, int] = {}
    prev_marker: dict[int, int] = {}
    visited = {start}
    q: deque[int] = deque([start])

    while q:
        u = q.popleft()
        for v, marker_id in adj.get(u, ()):
            if v in visited:
                continue
            visited.add(v)
            prev_node[v] = u
            prev_marker[v] = marker_id
            if v in ends:
                path, steps = _reconstruct_route(start, v, prev_node, prev_marker)
                return path, steps, v
            q.append(v)

    return [], [], None


def route_for_plan(plan_id: int, start_point_id: int, end_point_id: int) -> dict[str, Any]:
    """
    Validates points belong to plan, runs BFS, returns API-shaped dict.
    """
    ok_start = MapPoint.objects.filter(plan_id=plan_id, id=start_point_id).exists()
    ok_end = MapPoint.objects.filter(plan_id=plan_id, id=end_point_id).exists()
    if not ok_start or not ok_end:
        return {"error": "start_point и end_point должны существовать и принадлежать плану."}

    edges = transition_edges_for_plan(plan_id)
    adj = build_adjacency(edges)
    path, steps = bfs_shortest_route(adj, start_point_id, end_point_id)

    if not path:
        return {
            "found": False,
            "path": [],
            "steps": [],
            "point_names": {},
        }

    names = dict(
        MapPoint.objects.filter(plan_id=plan_id, id__in=path).values_list("id", "name")
    )
    point_names = {str(pid): names.get(pid, "") for pid in path}

    return {
        "found": True,
        "path": path,
        "steps": steps,
        "point_names": point_names,
    }
