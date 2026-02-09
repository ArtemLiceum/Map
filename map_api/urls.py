# urls.py
from rest_framework.routers import DefaultRouter
from .views import (
    EvacPlanViewSet, MapPointViewSet,
    PanoramaViewSet, PanoramaMarkerViewSet,
    UserViewSet, GroupViewSet, PermissionViewSet,
)

router = DefaultRouter()
router.register(r'evac_plans', EvacPlanViewSet)
router.register(r'map_points', MapPointViewSet)
router.register(r'panoramas', PanoramaViewSet)
router.register(r'panorama_markers', PanoramaMarkerViewSet)
router.register(r'users', UserViewSet)
router.register(r'groups', GroupViewSet)
router.register(r'permissions', PermissionViewSet)

urlpatterns = router.urls
