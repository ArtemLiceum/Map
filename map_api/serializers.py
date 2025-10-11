from rest_framework import serializers
from .models import EvacPlan, MapPoint, Panorama, PanoramaMarker


class PanoramaMarkerSerializer(serializers.ModelSerializer):
    target_point_name = serializers.CharField(source='target_point.name', read_only=True)

    class Meta:
        model = PanoramaMarker
        fields = ['id', 'panorama', 'target_point', 'target_point_name', 'azimuth', 'pitch']


class PanoramaSerializer(serializers.ModelSerializer):
    markers = PanoramaMarkerSerializer(many=True, read_only=True)

    class Meta:
        model = Panorama
        fields = ['id', 'point', 'image', 'markers']


class MapPointSerializer(serializers.ModelSerializer):
    panorama = PanoramaSerializer(read_only=True)

    class Meta:
        model = MapPoint
        fields = ['id', 'plan', 'name', 'x', 'y', 'panorama']


class EvacPlanSerializer(serializers.ModelSerializer):
    points = MapPointSerializer(many=True, read_only=True)

    class Meta:
        model = EvacPlan
        fields = ['id', 'title', 'image', 'points', 'created_at']
