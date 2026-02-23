# urls.py
from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .jwt import EmailTokenObtainPairView
from .views import (
    EvacPlanViewSet, MapPointViewSet,
    PanoramaViewSet, PanoramaMarkerViewSet, TourViewSet,
    UserViewSet, GroupViewSet, PermissionViewSet,
)

router = DefaultRouter()
router.register(r'evac_plans', EvacPlanViewSet)
router.register(r'map_points', MapPointViewSet)
router.register(r'panoramas', PanoramaViewSet)
router.register(r'panorama_markers', PanoramaMarkerViewSet)
router.register(r'tours', TourViewSet)
router.register(r'users', UserViewSet)
router.register(r'groups', GroupViewSet)
router.register(r'permissions', PermissionViewSet)

urlpatterns = [
    path('token/', EmailTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]

urlpatterns += router.urls
