from rest_framework import viewsets, status
from rest_framework.permissions import IsAdminUser, AllowAny, SAFE_METHODS
from rest_framework.response import Response
from .models import EvacPlan, MapPoint, Panorama, PanoramaMarker, PanoramaInfoPoint
from .serializers import (
    EvacPlanSerializer, EvacPlanListSerializer, MapPointSerializer,
    PanoramaSerializer, PanoramaMarkerSerializer, PanoramaInfoPointSerializer
)


class IsAdminOrReadOnly:
    """
    Custom permission: read-only for everyone, write operations only for admins.
    """
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return request.user and request.user.is_staff


class AdminOnlyViewSetMixin:
    """
    Mixin that restricts write operations to admin users only.
    Safe methods (GET, HEAD, OPTIONS) are allowed for everyone.
    """
    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            permission_classes = [AllowAny]
        else:
            permission_classes = [IsAdminUser]
        return [permission() for permission in permission_classes]


class EvacPlanViewSet(AdminOnlyViewSetMixin, viewsets.ModelViewSet):
    queryset = EvacPlan.objects.prefetch_related(
        'points',
        'points__panorama',
        'points__panorama__markers',
        'points__panorama__info_points'
    ).all()

    def get_serializer_class(self):
        if self.action == 'list':
            return EvacPlanListSerializer
        return EvacPlanSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        # Optional search by title or floor
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(title__icontains=search) | qs.filter(floor__icontains=search)
        floor = self.request.query_params.get('floor')
        if floor:
            qs = qs.filter(floor=floor)
        return qs.distinct()


class MapPointViewSet(AdminOnlyViewSetMixin, viewsets.ModelViewSet):
    queryset = MapPoint.objects.select_related('plan', 'panorama').prefetch_related(
        'panorama__markers',
        'panorama__info_points'
    ).all()
    serializer_class = MapPointSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        plan_id = self.request.query_params.get('plan')
        if plan_id:
            qs = qs.filter(plan_id=plan_id)
        point_type = self.request.query_params.get('type')
        if point_type:
            qs = qs.filter(type=point_type)
        return qs


class PanoramaViewSet(AdminOnlyViewSetMixin, viewsets.ModelViewSet):
    queryset = Panorama.objects.select_related('point').prefetch_related('markers', 'info_points').all()
    serializer_class = PanoramaSerializer


class PanoramaMarkerViewSet(viewsets.ModelViewSet):
    queryset = PanoramaMarker.objects.select_related('panorama', 'target_point').all()
    serializer_class = PanoramaMarkerSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        panorama_id = self.request.query_params.get('panorama')
        if panorama_id:
            qs = qs.filter(panorama_id=panorama_id)
        return qs


class PanoramaInfoPointViewSet(AdminOnlyViewSetMixin, viewsets.ModelViewSet):
    queryset = PanoramaInfoPoint.objects.select_related('panorama', 'panorama__point').all()
    serializer_class = PanoramaInfoPointSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        panorama_id = self.request.query_params.get('panorama')
        if panorama_id:
            qs = qs.filter(panorama_id=panorama_id)
        return qs
