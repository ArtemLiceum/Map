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
