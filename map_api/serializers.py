from django.contrib.auth.models import User, Group, Permission
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from .models import EvacPlan, Facility, MapPoint, Panorama, PanoramaMarker, Tour, TourInfoMarkerView


class PanoramaMarkerSerializer(serializers.ModelSerializer):
    target_point_name = serializers.SerializerMethodField()
    target_plan_id = serializers.SerializerMethodField()
    tours = serializers.PrimaryKeyRelatedField(
        many=True,
        required=False,
        queryset=Tour.objects.all(),
        allow_empty=True,
    )

    class Meta:
        model = PanoramaMarker
        fields = [
            'id', 'panorama', 'target_point', 'target_point_name',
            'target_plan_id',
            'azimuth', 'pitch', 'entry_azimuth', 'label', 'type', 'text', 'tours'
        ]

    def get_target_point_name(self, obj):
        return obj.target_point.name if obj.target_point else None

    def get_target_plan_id(self, obj):
        return obj.target_point.plan_id if obj.target_point else None

    def validate(self, attrs):
        instance = getattr(self, 'instance', None)
        marker_type = attrs.get('type') or (instance.type if instance else PanoramaMarker.MarkerType.TRANSITION)
        target_point = attrs.get('target_point', instance.target_point if instance else None)
        tours = attrs.get('tours', None)
        panorama = attrs.get('panorama', instance.panorama if instance else None)

        if marker_type == PanoramaMarker.MarkerType.TRANSITION and target_point is None:
            raise serializers.ValidationError({"target_point": "Целевая точка обязательна для переходной метки."})
        if marker_type == PanoramaMarker.MarkerType.INFO and target_point is not None:
            raise serializers.ValidationError({"target_point": "Для информационной метки target_point должен отсутствовать."})

        # Межплановый transition разрешён только внутри одной non-null Facility.
        if marker_type == PanoramaMarker.MarkerType.TRANSITION and target_point is not None and panorama is not None:
            source_plan_id, source_facility_id = self._get_plan_and_facility_from_panorama(panorama)
            target_plan_id, target_facility_id = self._get_plan_and_facility_from_point(target_point)
            if source_plan_id and target_plan_id and source_plan_id != target_plan_id:
                if (
                    source_facility_id is None
                    or target_facility_id is None
                    or source_facility_id != target_facility_id
                ):
                    raise serializers.ValidationError(
                        {
                            "target_point": (
                                "Межплановый переход разрешён только между планами одной Facility "
                                "(оба facility_id должны быть заполнены и совпадать)."
                            )
                        }
                    )

        # Tours allowed only for info markers
        if marker_type == PanoramaMarker.MarkerType.TRANSITION:
            if tours not in (None, []):
                raise serializers.ValidationError({"tours": "Привязка к туру доступна только для информационных меток."})
            # ensure cleanup if marker was info before
            if tours is None and instance and instance.tours.exists():
                attrs['tours'] = []
        else:
            if tours:
                plan_id = self._get_plan_id_from_panorama(panorama)
                for tour in tours:
                    if tour.plan_id != plan_id:
                        raise serializers.ValidationError({"tours": f"Тур {tour.id} относится к другому плану."})
        return attrs

    def _get_plan_id_from_panorama(self, panorama):
        if not panorama:
            return None
        if hasattr(panorama, 'point'):
            return panorama.point.plan_id
        pano_id = panorama.pk if hasattr(panorama, 'pk') else panorama
        try:
            pano = Panorama.objects.select_related('point__plan').only('id', 'point__plan').get(id=pano_id)
            return pano.point.plan_id
        except Panorama.DoesNotExist:
            return None

    def _get_plan_and_facility_from_point(self, point: MapPoint | None) -> tuple[int | None, int | None]:
        if not point:
            return None, None
        plan_id = getattr(point, "plan_id", None)
        if plan_id is None:
            return None, None
        # If plan is already cached, use it without extra query.
        plan = getattr(point, "plan", None)
        if isinstance(plan, EvacPlan):
            return plan_id, getattr(plan, "facility_id", None)
        facility_id = (
            EvacPlan.objects.only("id", "facility_id").filter(id=plan_id).values_list("facility_id", flat=True).first()
        )
        return plan_id, facility_id

    def _get_plan_and_facility_from_panorama(self, panorama: Panorama | int | None) -> tuple[int | None, int | None]:
        if not panorama:
            return None, None
        if hasattr(panorama, "point"):
            try:
                point = panorama.point
            except MapPoint.DoesNotExist:
                return None, None
            return self._get_plan_and_facility_from_point(point)

        pano_id = panorama.pk if hasattr(panorama, "pk") else panorama
        try:
            pano = (
                Panorama.objects.select_related("point__plan")
                .only("id", "point__plan__id", "point__plan__facility_id")
                .get(id=pano_id)
            )
        except Panorama.DoesNotExist:
            return None, None
        point = pano.point
        return self._get_plan_and_facility_from_point(point)

    def create(self, validated_data):
        tours = validated_data.pop('tours', [])
        marker = super().create(validated_data)
        if tours:
            marker.tours.set(tours)
        return marker

    def update(self, instance, validated_data):
        tours = validated_data.pop('tours', None)
        marker = super().update(instance, validated_data)
        if tours is not None:
            marker.tours.set(tours)
        return marker


class PanoramaSerializer(serializers.ModelSerializer):
    markers = PanoramaMarkerSerializer(many=True, read_only=True)

    class Meta:
        model = Panorama
        fields = ['id', 'point', 'image', 'markers']


class MapPointSerializer(serializers.ModelSerializer):
    panorama = PanoramaSerializer(read_only=True)

    class Meta:
        model = MapPoint
        fields = ['id', 'plan', 'name', 'x', 'y', 'info_text', 'panorama']

    def validate_x(self, value):
        """Clamp x to 0-100 range"""
        return max(0, min(100, value))

    def validate_y(self, value):
        """Clamp y to 0-100 range"""
        return max(0, min(100, value))


class EvacPlanSerializer(serializers.ModelSerializer):
    points = MapPointSerializer(many=True, read_only=True)
    facility_id = serializers.IntegerField(read_only=True)
    facility = serializers.PrimaryKeyRelatedField(
        queryset=Facility.objects.all(),
        allow_null=True,
        required=False,
        write_only=True,
    )

    class Meta:
        model = EvacPlan
        fields = ['id', 'title', 'floor', 'image', 'facility', 'facility_id', 'points', 'created_at']


class EvacPlanListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views (without nested points)"""
    points_count = serializers.SerializerMethodField()
    facility_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = EvacPlan
        fields = ['id', 'title', 'floor', 'image', 'facility_id', 'points_count', 'created_at']

    def get_points_count(self, obj):
        return obj.points.count()


class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ['id', 'name']


class PermissionSerializer(serializers.ModelSerializer):
    app_label = serializers.SerializerMethodField()

    class Meta:
        model = Permission
        fields = ['id', 'codename', 'name', 'app_label']

    def get_app_label(self, obj):
        return obj.content_type.app_label if obj.content_type else None


class UserAdminSerializer(serializers.ModelSerializer):
    groups = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Group.objects.all(), required=False
    )
    user_permissions = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Permission.objects.all(), required=False
    )

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'is_active',
            'is_staff',
            'is_superuser',
            'groups',
            'user_permissions',
            'date_joined',
            'last_login',
        ]
        read_only_fields = ['id', 'date_joined', 'last_login']

    def validate_username(self, value):
        return value.strip()

    def validate_email(self, value):
        return value.strip() if value else value

    def validate(self, attrs):
        """
        Prevent demoting or deactivating the last active superuser.
        """
        instance: User | None = getattr(self, 'instance', None)
        if not instance:
            return attrs

        # Determine resulting flags
        is_superuser = attrs.get('is_superuser', instance.is_superuser)
        is_active = attrs.get('is_active', instance.is_active)

        if instance.is_superuser and (not is_superuser or not is_active):
            from django.contrib.auth import get_user_model

            UserModel = get_user_model()
            active_superusers = UserModel.objects.filter(
                is_superuser=True, is_active=True
            ).exclude(id=instance.id)
            if not active_superusers.exists():
                raise serializers.ValidationError(
                    "Нельзя отключить последнего активного суперпользователя."
                )
        return attrs


class TourSerializer(serializers.ModelSerializer):
    markers_count = serializers.SerializerMethodField()
    progress_viewed = serializers.SerializerMethodField()
    progress_total = serializers.SerializerMethodField()
    progress_percent = serializers.SerializerMethodField()

    class Meta:
        model = Tour
        fields = [
            'id',
            'plan',
            'title',
            'is_active',
            'created_at',
            'markers_count',
            'progress_viewed',
            'progress_total',
            'progress_percent',
        ]

    def get_markers_count(self, obj):
        return obj.markers.count()

    def get_progress_total(self, obj):
        if hasattr(obj, 'progress_total'):
            return int(obj.progress_total or 0)
        return obj.markers.filter(type=PanoramaMarker.MarkerType.INFO).count()

    def get_progress_viewed(self, obj):
        if hasattr(obj, 'progress_viewed'):
            return int(obj.progress_viewed or 0)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return 0
        return TourInfoMarkerView.objects.filter(user=user, tour=obj).count()

    def get_progress_percent(self, obj):
        total = self.get_progress_total(obj)
        if total <= 0:
            return 0
        viewed = self.get_progress_viewed(obj)
        return int(round((viewed / total) * 100))


class UserSetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        pw1 = attrs.get('new_password')
        pw2 = attrs.get('new_password_confirm')
        if pw1 != pw2:
            raise serializers.ValidationError({"new_password_confirm": "Пароли не совпадают."})

        user = self.context.get('user')
        validate_password(pw1, user=user)
        return attrs


class FacilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Facility
        fields = ['id', 'title', 'created_at']
        read_only_fields = ['id', 'created_at']


class FacilityPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = EvacPlan
        fields = ['id', 'title', 'floor', 'image']
        read_only_fields = fields


class FacilityDetailSerializer(serializers.ModelSerializer):
    plans = FacilityPlanSerializer(many=True, read_only=True)

    class Meta:
        model = Facility
        fields = ['id', 'title', 'created_at', 'plans']
        read_only_fields = ['id', 'created_at', 'plans']
