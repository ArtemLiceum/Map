from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import EvacPlan, MapPoint, Panorama


class PanoramaInfoPointValidationTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='admin',
            email='admin@example.com',
            password='adminpass123'
        )
        self.client.force_authenticate(user=self.admin)

        self.plan = EvacPlan.objects.create(title='Plan', floor=1, image='evac_plans/test.jpg')
        self.point = MapPoint.objects.create(plan=self.plan, name='P1', type=MapPoint.TYPE_TRANSITION, x=10, y=10)
        self.panorama = Panorama.objects.create(point=self.point, image='panoramas/test.jpg')

    def test_create_info_point_rejects_azimuth_out_of_range(self):
        resp = self.client.post('/api/panorama_info_points/', {
            'panorama': self.panorama.id,
            'azimuth': 999,
            'pitch': 0,
            'title': 't',
            'text': 'hello'
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('azimuth', resp.data)

    def test_create_info_point_rejects_pitch_out_of_range(self):
        resp = self.client.post('/api/panorama_info_points/', {
            'panorama': self.panorama.id,
            'azimuth': 10,
            'pitch': 999,
            'title': 't',
            'text': 'hello'
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('pitch', resp.data)

    def test_create_info_point_normalizes_azimuth_360_to_0(self):
        resp = self.client.post('/api/panorama_info_points/', {
            'panorama': self.panorama.id,
            'azimuth': 360,
            'pitch': 0,
            'title': 't',
            'text': 'hello'
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(float(resp.data['azimuth']), 0.0)
