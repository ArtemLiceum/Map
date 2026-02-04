from rest_framework import serializers
from .models import EvacPlan, MapPoint, Panorama, PanoramaMarker


class PanoramaMarkerSerializer(serializers.ModelSerializer):
    target_point_name = serializers.CharField(source='target_point.name', read_only=True)

    class Meta:
        model = PanoramaMarker
        fields = [
            'id', 'panorama', 'target_point', 'target_point_name',
            'azimuth', 'pitch', 'label'
        ]


class PanoramaSerializer(serializers.ModelSerializer):
    markers = PanoramaMarkerSerializer(many=True, read_only=True)

    class Meta:
        model = Panorama
        fields = ['id', 'point', 'image', 'markers']


class MapPointSerializer(serializers.ModelSerializer):
    panorama = PanoramaSerializer(read_only=True)

    class Meta:
        model = MapPoint
        fields = ['id', 'plan', 'name', 'type', 'x', 'y', 'info_text', 'panorama']

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
