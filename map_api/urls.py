# urls.py
from rest_framework.routers import DefaultRouter
from .views import (
    EvacPlanViewSet, MapPointViewSet,
    PanoramaViewSet, PanoramaMarkerViewSet
)

router = DefaultRouter()
router.register(r'evac_plans', EvacPlanViewSet)
router.register(r'map_points', MapPointViewSet)
router.register(r'panoramas', PanoramaViewSet)
router.register(r'panorama_markers', PanoramaMarkerViewSet)

urlpatterns = router.urls
