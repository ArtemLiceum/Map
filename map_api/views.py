from rest_framework import viewsets, status
from rest_framework.permissions import IsAdminUser, AllowAny, SAFE_METHODS
from rest_framework.response import Response
from .models import EvacPlan, MapPoint, Panorama, PanoramaMarker
from .utils import apply_crop, parse_crop_data
from .serializers import (
    EvacPlanSerializer, EvacPlanListSerializer, MapPointSerializer,
    PanoramaSerializer, PanoramaMarkerSerializer
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

    def get_serializer(self, *args, **kwargs):
        if 'data' in kwargs:
            try:
                data = kwargs['data'].copy()
                data.pop('crop', None)
                kwargs['data'] = data
            except Exception:
                pass
        return super().get_serializer(*args, **kwargs)

    def _get_cropped_file(self, request, *, field_name='image', instance=None):
        """
        Returns cropped file if crop data provided, otherwise the original uploaded file (if any).
        If no new file is uploaded and crop is provided, it will crop the existing instance file.
        """
        crop_data = parse_crop_data(request.data.get('crop'))
        uploaded = request.FILES.get(field_name)
        source = uploaded or getattr(instance, field_name, None)
        if crop_data and source:
            return apply_crop(source, crop_data, preferred_name=getattr(source, 'name', None))
        return uploaded


class EvacPlanViewSet(AdminOnlyViewSetMixin, viewsets.ModelViewSet):
    queryset = EvacPlan.objects.prefetch_related('points', 'points__panorama', 'points__panorama__markers').all()

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

    def perform_create(self, serializer):
        cropped = self._get_cropped_file(self.request)
        serializer.save(image=cropped or self.request.FILES.get('image'))

    def perform_update(self, serializer):
        instance: EvacPlan = serializer.instance
        cropped = self._get_cropped_file(self.request, instance=instance)
        if cropped:
            if instance.image:
                instance.image.delete(save=False)
            serializer.save(image=cropped)
        else:
            serializer.save()


class MapPointViewSet(AdminOnlyViewSetMixin, viewsets.ModelViewSet):
    queryset = MapPoint.objects.select_related('plan', 'panorama').prefetch_related('panorama__markers').all()
    serializer_class = MapPointSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        plan_id = self.request.query_params.get('plan')
        if plan_id:
            qs = qs.filter(plan_id=plan_id)
        return qs


class PanoramaViewSet(AdminOnlyViewSetMixin, viewsets.ModelViewSet):
    queryset = Panorama.objects.select_related('point').prefetch_related('markers').all()
    serializer_class = PanoramaSerializer

    def create(self, request, *args, **kwargs):
        point_id = request.data.get('point')
        if point_id:
            # Check if panorama already exists for this point — replace it
            existing = Panorama.objects.filter(point_id=point_id).first()
            if existing:
                existing.image.delete(save=False)
                existing.delete()
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        cropped = self._get_cropped_file(self.request)
        serializer.save(image=cropped or self.request.FILES.get('image'))

    def perform_update(self, serializer):
        instance: Panorama = serializer.instance
        cropped = self._get_cropped_file(self.request, instance=instance)
        if cropped:
            if instance.image:
                instance.image.delete(save=False)
            serializer.save(image=cropped)
        else:
            serializer.save()


class PanoramaMarkerViewSet(AdminOnlyViewSetMixin, viewsets.ModelViewSet):
    queryset = PanoramaMarker.objects.select_related('panorama', 'target_point', 'panorama__point').all()
    serializer_class = PanoramaMarkerSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        panorama_id = self.request.query_params.get('panorama')
        if panorama_id:
            qs = qs.filter(panorama_id=panorama_id)
        return qs
