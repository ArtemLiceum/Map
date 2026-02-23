from django.contrib.auth.models import User, Group, Permission
from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAdminUser, AllowAny, SAFE_METHODS, IsAuthenticated
from rest_framework.response import Response
from django.db.models import Prefetch
from .models import EvacPlan, MapPoint, Panorama, PanoramaMarker, Tour
from .utils import apply_crop, parse_crop_data
from .permissions import IsSuperUser
from .serializers import (
    EvacPlanSerializer,
    EvacPlanListSerializer,
    MapPointSerializer,
    PanoramaSerializer,
    PanoramaMarkerSerializer,
    UserAdminSerializer,
    UserSetPasswordSerializer,
    GroupSerializer,
    PermissionSerializer,
    TourSerializer,
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
    queryset = EvacPlan.objects.all()

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
        marker_qs = self._marker_queryset_for_request()
        qs = qs.prefetch_related(
            'points',
            'points__panorama',
            Prefetch('points__panorama__markers', queryset=marker_qs),
            Prefetch('points__panorama__markers__tours'),
        )
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

    def _marker_queryset_for_request(self):
        user = getattr(self.request, 'user', None)
        tour_id = self.request.query_params.get('tour')
        include_info_raw = self.request.query_params.get('include_info')
        include_info = str(include_info_raw).lower() in ('1', 'true', 'yes', 'on')
        base_qs = PanoramaMarker.objects.select_related('panorama', 'target_point', 'panorama__point')

        # Для редактора (staff): иногда нужно получить все маркеры без фильтрации.
        if include_info and user and user.is_authenticated and user.is_staff:
            return base_qs

        # "Без тура": для всех ролей скрываем информационные метки
        # (возвращаем только переходные маркеры).
        if not tour_id:
            return base_qs.filter(type=PanoramaMarker.MarkerType.TRANSITION)

        if not user or not user.is_authenticated:
            return base_qs.filter(type=PanoramaMarker.MarkerType.TRANSITION)

        if user.is_staff:
            if tour_id:
                return base_qs.filter(Q(type=PanoramaMarker.MarkerType.TRANSITION) | Q(tours__id=tour_id)).distinct()
            return base_qs.filter(type=PanoramaMarker.MarkerType.TRANSITION)

        # authenticated but not staff
        if tour_id:
            return base_qs.filter(
                Q(type=PanoramaMarker.MarkerType.TRANSITION)
                | Q(type=PanoramaMarker.MarkerType.INFO, tours__id=tour_id)
            ).distinct()
        return base_qs.filter(type=PanoramaMarker.MarkerType.TRANSITION)


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
    queryset = PanoramaMarker.objects.select_related('panorama', 'target_point', 'panorama__point').prefetch_related('tours').all()
    serializer_class = PanoramaMarkerSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        panorama_id = self.request.query_params.get('panorama')
        if panorama_id:
            qs = qs.filter(panorama_id=panorama_id)
        return qs


class TourViewSet(viewsets.ModelViewSet):
    queryset = Tour.objects.select_related('plan').prefetch_related('markers')
    serializer_class = TourSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            permission_classes = [IsAdminUser]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        qs = super().get_queryset()
        plan_id = self.request.query_params.get('plan')
        if plan_id:
            qs = qs.filter(plan_id=plan_id)
        if not self.request.user.is_staff:
            qs = qs.filter(is_active=True)
        return qs.order_by('plan_id', 'title')


class UserViewSet(viewsets.ModelViewSet):
    """
    Superuser-only full access to users.
    """

    queryset = User.objects.all().order_by('username').prefetch_related('groups', 'user_permissions')
    serializer_class = UserAdminSerializer
    permission_classes = [IsSuperUser]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search')
        if search:
            search = search.strip()
            qs = qs.filter(
                (
                    Q(username__icontains=search)
                    | Q(email__icontains=search)
                    | Q(first_name__icontains=search)
                    | Q(last_name__icontains=search)
                )
            )
        return qs

    @action(detail=True, methods=['post'], url_path='set-password', permission_classes=[IsSuperUser])
    def set_password(self, request, pk=None):
        user = self.get_object()
        serializer = UserSetPasswordSerializer(data=request.data, context={'user': user})
        serializer.is_valid(raise_exception=True)
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        return Response({'detail': 'Пароль обновлён.'}, status=status.HTTP_200_OK)


class GroupViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Group.objects.all().order_by('name')
    serializer_class = GroupSerializer
    permission_classes = [IsSuperUser]


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Permission.objects.select_related('content_type').all().order_by('content_type__app_label', 'codename')
    serializer_class = PermissionSerializer
    permission_classes = [IsSuperUser]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search')
        if search:
            search = search.strip()
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(codename__icontains=search)
                | Q(content_type__app_label__icontains=search)
            )
        return qs
