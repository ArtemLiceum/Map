import shutil
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from map_api.models import EvacPlan, MapPoint, Panorama, PanoramaMarker
from map_api.route_graph import (
    bfs_shortest_route,
    bfs_shortest_route_to_any_end,
    build_adjacency,
    transition_edges_for_plan,
)

User = get_user_model()


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage")
class EvacPlanRouteGraphTests(APITestCase):
    def test_bfs_deterministic_parallel_edges(self):
        """Two markers A->B: lower marker id is expanded first (sorted adjacency)."""
        adj = build_adjacency([(1, 2, 10), (1, 2, 5)])
        path, steps = bfs_shortest_route(adj, 1, 2)
        self.assertEqual(path, [1, 2])
        self.assertEqual(len(steps), 1)
        self.assertEqual(steps[0]["marker_id"], 5)

    def test_bfs_shortest_to_any_end(self):
        adj = build_adjacency([(1, 2, 1), (2, 3, 2)])
        path, steps, end = bfs_shortest_route_to_any_end(adj, 1, {3, 99})
        self.assertEqual(end, 3)
        self.assertEqual(path, [1, 2, 3])
        self.assertEqual(len(steps), 2)


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage")
class EvacPlanRouteAPITests(APITestCase):
    def _png(self, name: str = "img.png") -> SimpleUploadedFile:
        from PIL import Image
        import io

        buf = io.BytesIO()
        Image.new("RGB", (2, 2), (255, 0, 0)).save(buf, format="PNG")
        return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")

    def setUp(self):
        super().setUp()
        self._tmp_media = tempfile.mkdtemp(prefix="test_media_route_")
        self.addCleanup(lambda: shutil.rmtree(self._tmp_media, ignore_errors=True))

        with patch("django.conf.settings.MEDIA_ROOT", self._tmp_media):
            self.plan = EvacPlan.objects.create(
                title="Plan R",
                floor=1,
                image=self._png("plan.png"),
            )
            self.point_a = MapPoint.objects.create(plan=self.plan, name="A", x=0, y=0)
            self.point_b = MapPoint.objects.create(plan=self.plan, name="B", x=50, y=0)
            self.point_c = MapPoint.objects.create(plan=self.plan, name="C", x=100, y=0)
            self.point_d = MapPoint.objects.create(plan=self.plan, name="D", x=0, y=50)

            self.pano_a = Panorama.objects.create(
                point=self.point_a,
                image=self._png("a.png"),
            )
            self.pano_b = Panorama.objects.create(
                point=self.point_b,
                image=self._png("b.png"),
            )
            self.pano_c = Panorama.objects.create(
                point=self.point_c,
                image=self._png("c.png"),
            )
            Panorama.objects.create(point=self.point_d, image=self._png("d.png"))

            PanoramaMarker.objects.create(
                panorama=self.pano_a,
                target_point=self.point_b,
                azimuth=90,
                type=PanoramaMarker.MarkerType.TRANSITION,
            )
            PanoramaMarker.objects.create(
                panorama=self.pano_b,
                target_point=self.point_c,
                azimuth=90,
                type=PanoramaMarker.MarkerType.TRANSITION,
            )

    def _route_url(self, plan_id: int) -> str:
        return f"/api/evac_plans/{plan_id}/route/"

    def test_route_chain_anonymous(self):
        url = self._route_url(self.plan.id)
        resp = self.client.get(
            url,
            {"start_point": self.point_a.id, "end_point": self.point_c.id},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertTrue(data["found"])
        self.assertEqual(data["path"], [self.point_a.id, self.point_b.id, self.point_c.id])
        self.assertEqual(len(data["steps"]), 2)
        self.assertEqual(data["steps"][0]["from_point_id"], self.point_a.id)
        self.assertEqual(data["steps"][0]["to_point_id"], self.point_b.id)
        self.assertEqual(data["steps"][1]["to_point_id"], self.point_c.id)

    def test_route_same_start_end(self):
        url = self._route_url(self.plan.id)
        resp = self.client.get(
            url,
            {"start_point": self.point_b.id, "end_point": self.point_b.id},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertTrue(data["found"])
        self.assertEqual(data["path"], [self.point_b.id])
        self.assertEqual(data["steps"], [])

    def test_route_unreachable(self):
        url = self._route_url(self.plan.id)
        resp = self.client.get(
            url,
            {"start_point": self.point_a.id, "end_point": self.point_d.id},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertFalse(data["found"])
        self.assertEqual(data["path"], [])
        self.assertEqual(data["steps"], [])

    def test_route_missing_params(self):
        resp = self.client.get(self._route_url(self.plan.id), {"start_point": self.point_a.id})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_route_invalid_point_ids(self):
        other = EvacPlan.objects.create(title="Other", floor=2, image=self._png("o.png"))
        foreign = MapPoint.objects.create(plan=other, name="X", x=1, y=1)

        resp = self.client.get(
            self._route_url(self.plan.id),
            {"start_point": self.point_a.id, "end_point": foreign.id},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_transition_edges_for_plan_matches_db(self):
        edges = transition_edges_for_plan(self.plan.id)
        self.assertEqual(len(edges), 2)
        from_ids = {e[0] for e in edges}
        self.assertEqual(from_ids, {self.point_a.id, self.point_b.id})
