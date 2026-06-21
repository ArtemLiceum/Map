from django.test import TestCase

from map_api.route_graph import (
    bfs_shortest_route,
    bfs_shortest_route_to_any_end,
    build_adjacency,
)


class RouteGraphUnitTests(TestCase):
    def test_build_adjacency_sorts_edges_by_marker_id(self):
        edges = [(1, 2, 30), (1, 3, 10), (1, 4, 20)]
        adj = build_adjacency(edges)
        self.assertEqual(adj[1], [(3, 10), (4, 20), (2, 30)])

    def test_bfs_same_start_and_end(self):
        adj = build_adjacency([(1, 2, 1)])
        path, steps = bfs_shortest_route(adj, 5, 5)
        self.assertEqual(path, [5])
        self.assertEqual(steps, [])

    def test_bfs_unreachable(self):
        adj = build_adjacency([(1, 2, 1)])
        path, steps = bfs_shortest_route(adj, 1, 99)
        self.assertEqual(path, [])
        self.assertEqual(steps, [])

    def test_bfs_skips_already_visited_nodes(self):
        # diamond with duplicate edge attempt to same node
        adj = build_adjacency([(1, 2, 1), (1, 3, 2), (2, 4, 3), (3, 4, 4), (2, 4, 5)])
        path, steps = bfs_shortest_route(adj, 1, 4)
        self.assertEqual(path, [1, 2, 4])
        self.assertEqual(len(steps), 2)

    def test_bfs_to_any_end_skips_visited_nodes(self):
        adj = build_adjacency([(1, 2, 1), (2, 3, 2), (1, 3, 3)])
        path, steps, end = bfs_shortest_route_to_any_end(adj, 1, {3})
        self.assertEqual(end, 3)
        self.assertEqual(path, [1, 3])

    def test_bfs_to_any_end_empty_ends(self):
        adj = build_adjacency([(1, 2, 1)])
        path, steps, end = bfs_shortest_route_to_any_end(adj, 1, set())
        self.assertEqual(path, [])
        self.assertEqual(steps, [])
        self.assertIsNone(end)

    def test_bfs_to_any_end_start_is_target(self):
        adj = build_adjacency([(1, 2, 1)])
        path, steps, end = bfs_shortest_route_to_any_end(adj, 7, {7, 8})
        self.assertEqual(path, [7])
        self.assertEqual(steps, [])
        self.assertEqual(end, 7)

    def test_bfs_to_any_end_unreachable(self):
        adj = build_adjacency([(1, 2, 1)])
        path, steps, end = bfs_shortest_route_to_any_end(adj, 1, {99})
        self.assertEqual(path, [])
        self.assertEqual(steps, [])
        self.assertIsNone(end)

    def test_bfs_to_any_end_finds_nearest(self):
        adj = build_adjacency([(1, 2, 1), (2, 3, 2), (1, 4, 3)])
        path, steps, end = bfs_shortest_route_to_any_end(adj, 1, {3, 4})
        self.assertEqual(end, 4)
        self.assertEqual(path, [1, 4])
        self.assertEqual(len(steps), 1)
