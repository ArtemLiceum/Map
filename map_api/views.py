import secrets

from django.contrib.auth.models import User, Group, Permission
from django.db.models import Q, Count, Max
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAdminUser, AllowAny, SAFE_METHODS, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Prefetch
from .models import (
    EvacPlan,
    Facility,
    MapPoint,
    Panorama,
    PanoramaMarker,
    Tour,
    TourInfoMarkerView,
    RegistrationCodeWord,
)
from .admin_log import ADDITION, CHANGE, DELETION, log_drf_action
from .utils import apply_crop, parse_crop_data
from .permissions import IsSuperUser
from .route_graph import (
    route_for_plan,
    route_for_facility,
    build_adjacency,
    bfs_shortest_route_to_any_end,
    transition_edges_for_plan,
)
from .serializers import (
    EvacPlanSerializer,
    EvacPlanListSerializer,
    FacilitySerializer,
    FacilityDetailSerializer,
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

    def perform_create(self, serializer):
        super().perform_create(serializer)
        log_drf_action(self.request.user, serializer.instance, ADDITION)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        log_drf_action(self.request.user, serializer.instance, CHANGE)

    def perform_destroy(self, instance):
        log_drf_action(self.request.user, instance, DELETION)
        super().perform_destroy(instance)

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

    def get_permissions(self):
        if self.action == 'route':
            return [AllowAny()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == 'list':
            return EvacPlanListSerializer
        return EvacPlanSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if not self.request.user.is_staff:
            qs = qs.filter(is_active=True)
        # Optional search by title or floor
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(title__icontains=search) | qs.filter(floor__icontains=search)
        floor = self.request.query_params.get('floor')
        if floor:
            qs = qs.filter(floor=floor)
        facility = self.request.query_params.get('facility')
        if facility:
            qs = qs.filter(facility_id=facility)
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
        log_drf_action(self.request.user, serializer.instance, ADDITION)

    def perform_update(self, serializer):
        instance: EvacPlan = serializer.instance
        cropped = self._get_cropped_file(self.request, instance=instance)
        if cropped:
            if instance.image:
                instance.image.delete(save=False)
            serializer.save(image=cropped)
        else:
            serializer.save()
        log_drf_action(self.request.user, serializer.instance, CHANGE)

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

    @action(
        detail=True,
        methods=['get'],
        url_path='route',
        permission_classes=[AllowAny],
    )
    def route(self, request, pk=None):
        """Кратчайший путь по transition-маркерам: query start_point, end_point (id MapPoint)."""
        self.get_object()
        raw_s = request.query_params.get('start_point')
        raw_e = request.query_params.get('end_point')
        if raw_s is None or raw_e is None:
            return Response(
                {'detail': 'Укажите параметры start_point и end_point.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            start_id = int(raw_s)
            end_id = int(raw_e)
        except (TypeError, ValueError):
            return Response(
                {'detail': 'start_point и end_point должны быть целыми числами.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = route_for_plan(int(pk), start_id, end_id)
        err = result.get('error')
        if err:
            return Response({'detail': err}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)


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
                log_drf_action(self.request.user, existing, DELETION)
                existing.image.delete(save=False)
                existing.delete()
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        cropped = self._get_cropped_file(self.request)
        serializer.save(image=cropped or self.request.FILES.get('image'))
        log_drf_action(self.request.user, serializer.instance, ADDITION)

    def perform_update(self, serializer):
        instance: Panorama = serializer.instance
        cropped = self._get_cropped_file(self.request, instance=instance)
        if cropped:
            if instance.image:
                instance.image.delete(save=False)
            serializer.save(image=cropped)
        else:
            serializer.save()
        log_drf_action(self.request.user, serializer.instance, CHANGE)


class PanoramaMarkerViewSet(AdminOnlyViewSetMixin, viewsets.ModelViewSet):
    queryset = (
        PanoramaMarker.objects.select_related(
            "panorama",
            "panorama__point",
            "panorama__point__plan",
            "target_point",
            "target_point__plan",
        )
        .prefetch_related("tours")
        .all()
    )
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
        user = getattr(self.request, 'user', None)
        if user and user.is_authenticated:
            qs = qs.annotate(
                progress_total=Count(
                    'tour_markers',
                    filter=Q(tour_markers__marker__type=PanoramaMarker.MarkerType.INFO),
                    distinct=True,
                ),
                progress_viewed=Count(
                    'info_marker_views',
                    filter=Q(info_marker_views__user=user),
                    distinct=True,
                ),
            )
        return qs.order_by('plan_id', 'title')

    def perform_create(self, serializer):
        super().perform_create(serializer)
        log_drf_action(self.request.user, serializer.instance, ADDITION)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        log_drf_action(self.request.user, serializer.instance, CHANGE)

    def perform_destroy(self, instance):
        log_drf_action(self.request.user, instance, DELETION)
        super().perform_destroy(instance)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated], url_path='mark-viewed')
    def mark_viewed(self, request, pk=None):
        tour = self.get_object()
        marker_id = request.data.get('marker_id')
        try:
            marker_id = int(marker_id)
        except (TypeError, ValueError):
            return Response({'detail': 'marker_id должен быть целым числом.'}, status=status.HTTP_400_BAD_REQUEST)

        marker = PanoramaMarker.objects.filter(id=marker_id).first()
        if not marker:
            return Response({'detail': 'Маркер не найден.'}, status=status.HTTP_404_NOT_FOUND)
        if marker.type != PanoramaMarker.MarkerType.INFO:
            return Response({'detail': 'Можно отметить только информационную метку.'}, status=status.HTTP_400_BAD_REQUEST)
        if not tour.tour_markers.filter(marker_id=marker.id).exists():
            return Response({'detail': 'Эта метка не принадлежит выбранному туру.'}, status=status.HTTP_400_BAD_REQUEST)

        TourInfoMarkerView.objects.get_or_create(
            user=request.user,
            tour=tour,
            marker=marker,
        )
        viewed = TourInfoMarkerView.objects.filter(user=request.user, tour=tour).count()
        total = tour.markers.filter(type=PanoramaMarker.MarkerType.INFO).count()
        percent = int(round((viewed / total) * 100)) if total else 0
        return Response({'viewed': viewed, 'total': total, 'percent': percent}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated], url_path='route-hint')
    def route_hint(self, request, pk=None):
        """
        Кратчайший путь от from_point до любой точки панорамы с непросмотренной info-меткой тура.
        """
        tour = self.get_object()
        plan_id = tour.plan_id
        raw = request.query_params.get('from_point') or request.query_params.get('start_point')
        if raw is None:
            return Response(
                {'detail': 'Укажите from_point (id точки плана).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            start_id = int(raw)
        except (TypeError, ValueError):
            return Response(
                {'detail': 'from_point должен быть целым числом.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not MapPoint.objects.filter(plan_id=plan_id, id=start_id).exists():
            return Response(
                {'detail': 'Точка не найдена или не относится к плану тура.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        viewed_ids = set(
            TourInfoMarkerView.objects.filter(user=request.user, tour=tour).values_list(
                'marker_id', flat=True
            )
        )
        markers = (
            PanoramaMarker.objects.filter(
                tour_markers__tour_id=tour.id,
                type=PanoramaMarker.MarkerType.INFO,
            )
            .select_related('panorama__point')
            .distinct()
        )

        ends: set[int] = set()
        for m in markers:
            if m.id in viewed_ids:
                continue
            pano = m.panorama
            if pano and pano.point_id:
                ends.add(pano.point_id)

        empty = {'found': False, 'path': [], 'steps': [], 'point_names': {}, 'end_point_id': None}

        if not ends:
            return Response(
                {
                    **empty,
                    'detail': 'Все метки тура уже просмотрены.',
                }
            )

        edges = transition_edges_for_plan(plan_id)
        adj = build_adjacency(edges)
        path, steps, end_reached = bfs_shortest_route_to_any_end(adj, start_id, ends)

        if not path or end_reached is None:
            return Response(
                {
                    **empty,
                    'detail': 'Нет пути по переходам к непосещённым меткам тура.',
                }
            )

        names = dict(
            MapPoint.objects.filter(plan_id=plan_id, id__in=path).values_list('id', 'name')
        )
        point_names = {str(pid): names.get(pid, '') for pid in path}
        point_plans = {str(pid): plan_id for pid in path}

        return Response(
            {
                'found': True,
                'end_point_id': end_reached,
                'path': path,
                'steps': steps,
                'point_names': point_names,
                'point_plans': point_plans,
            }
        )


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

    def perform_create(self, serializer):
        super().perform_create(serializer)
        log_drf_action(self.request.user, serializer.instance, ADDITION)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        log_drf_action(self.request.user, serializer.instance, CHANGE)

    def perform_destroy(self, instance):
        log_drf_action(self.request.user, instance, DELETION)
        super().perform_destroy(instance)

    @action(detail=True, methods=['post'], url_path='set-password', permission_classes=[IsSuperUser])
    def set_password(self, request, pk=None):
        user = self.get_object()
        serializer = UserSetPasswordSerializer(data=request.data, context={'user': user})
        serializer.is_valid(raise_exception=True)
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        log_drf_action(
            request.user,
            user,
            CHANGE,
            [{"changed": {"fields": ["password"]}}],
        )
        return Response({'detail': 'Пароль обновлён.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='tour-progress', permission_classes=[IsSuperUser])
    def tour_progress(self, request, pk=None):
        user_obj = self.get_object()
        plan_id = request.query_params.get('plan')
        tours_qs = Tour.objects.select_related('plan')
        if plan_id:
            tours_qs = tours_qs.filter(plan_id=plan_id)
        tours_qs = tours_qs.annotate(
            progress_total=Count(
                'tour_markers',
                filter=Q(tour_markers__marker__type=PanoramaMarker.MarkerType.INFO),
                distinct=True,
            ),
            progress_viewed=Count(
                'info_marker_views',
                filter=Q(info_marker_views__user=user_obj),
                distinct=True,
            ),
            last_viewed_at=Max(
                'info_marker_views__viewed_at',
                filter=Q(info_marker_views__user=user_obj),
            ),
        ).order_by('plan__title', 'title')

        data = [
            {
                'plan': t.plan_id,
                'plan_title': t.plan.title,
                'tour': t.id,
                'tour_title': t.title,
                'viewed': int(t.progress_viewed or 0),
                'total': int(t.progress_total or 0),
                'percent': int(round((t.progress_viewed / t.progress_total) * 100)) if t.progress_total else 0,
                'last_viewed_at': t.last_viewed_at,
            }
            for t in tours_qs
        ]
        return Response(data, status=status.HTTP_200_OK)


class RegistrationCodeWordView(APIView):
    permission_classes = [IsSuperUser]

    def get(self, request):
        obj = RegistrationCodeWord.get_solo()
        return Response({'word': obj.word if obj else ''})

    def post(self, request):
        word = secrets.token_urlsafe(24)
        obj, _ = RegistrationCodeWord.objects.update_or_create(
            pk=RegistrationCodeWord.SOLO_PK,
            defaults={'word': word},
        )
        log_drf_action(
            request.user,
            obj,
            CHANGE,
            [{"changed": {"fields": ["word"]}}],
        )
        return Response({'word': obj.word})


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


class FacilityViewSet(AdminOnlyViewSetMixin, viewsets.ModelViewSet):
    queryset = Facility.objects.all()

    def get_permissions(self):
        if self.action == 'route':
            return [AllowAny()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return FacilityDetailSerializer
        return FacilitySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == 'retrieve':
            plans_qs = EvacPlan.objects.all()
            if not self.request.user.is_staff:
                plans_qs = plans_qs.filter(is_active=True)
            return qs.prefetch_related(Prefetch('plans', queryset=plans_qs))
        return qs

    @action(
        detail=True,
        methods=['get'],
        url_path='route',
        permission_classes=[AllowAny],
    )
    def route(self, request, pk=None):
        """
        Facility-wide shortest path by transition markers: query start_point, end_point (MapPoint ids).
        """
        facility = self.get_object()
        raw_s = request.query_params.get('start_point')
        raw_e = request.query_params.get('end_point')
        if raw_s is None or raw_e is None:
            return Response(
                {'detail': 'Укажите параметры start_point и end_point.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            start_id = int(raw_s)
            end_id = int(raw_e)
        except (TypeError, ValueError):
            return Response(
                {'detail': 'start_point и end_point должны быть целыми числами.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = route_for_facility(int(facility.id), start_id, end_id)
        err = result.get('error')
        if err:
            return Response({'detail': err}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)
