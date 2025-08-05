from rest_framework import routers
from django.urls import path, include
from .views import (
    EvacPlanViewSet, MapPointViewSet,
    PanoramaViewSet, PanoramaMarkerViewSet
)

router = routers.DefaultRouter()
router.register(r'plans', EvacPlanViewSet)
router.register(r'points', MapPointViewSet)
router.register(r'panoramas', PanoramaViewSet)
router.register(r'markers', PanoramaMarkerViewSet)

urlpatterns = [
    path('', include(router.urls)),
]