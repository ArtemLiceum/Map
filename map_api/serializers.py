from django.contrib.auth.models import User, Group, Permission
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from .models import EvacPlan, MapPoint, Panorama, PanoramaMarker


class PanoramaMarkerSerializer(serializers.ModelSerializer):
    target_point_name = serializers.SerializerMethodField()

    class Meta:
        model = PanoramaMarker
        fields = [
            'id', 'panorama', 'target_point', 'target_point_name',
            'azimuth', 'pitch', 'label', 'type', 'text'
        ]

    def get_target_point_name(self, obj):
        return obj.target_point.name if obj.target_point else None

    def validate(self, attrs):
        instance = getattr(self, 'instance', None)
        marker_type = attrs.get('type') or (instance.type if instance else PanoramaMarker.MarkerType.TRANSITION)
        target_point = attrs.get('target_point', instance.target_point if instance else None)

        if marker_type == PanoramaMarker.MarkerType.TRANSITION and target_point is None:
            raise serializers.ValidationError({"target_point": "Целевая точка обязательна для переходной метки."})
        if marker_type == PanoramaMarker.MarkerType.INFO and target_point is not None:
            raise serializers.ValidationError({"target_point": "Для информационной метки target_point должен отсутствовать."})
        return attrs


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

    class Meta:
        model = EvacPlan
        fields = ['id', 'title', 'floor', 'image', 'points', 'created_at']


class EvacPlanListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views (without nested points)"""
    points_count = serializers.SerializerMethodField()

    class Meta:
        model = EvacPlan
        fields = ['id', 'title', 'floor', 'image', 'points_count', 'created_at']

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
