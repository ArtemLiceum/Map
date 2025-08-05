from rest_framework import serializers
from .models import EvacPlan, MapPoint, Panorama, PanoramaMarker

class PanoramaMarkerSerializer(serializers.ModelSerializer):
    class Meta:
        model = PanoramaMarker
        fields = ['id', 'target_point', 'azimuth', 'pitch']

class PanoramaSerializer(serializers.ModelSerializer):
    markers = PanoramaMarkerSerializer(many=True, read_only=True)

    class Meta:
        model = Panorama
        fields = ['id', 'image', 'markers']

class MapPointSerializer(serializers.ModelSerializer):
    panorama = PanoramaSerializer(read_only=True)

    class Meta:
        model = MapPoint
        fields = ['id', 'name', 'x', 'y', 'panorama']

class EvacPlanSerializer(serializers.ModelSerializer):
    points = MapPointSerializer(many=True, read_only=True)

    class Meta:
        model = EvacPlan
        fields = ['id', 'title', 'image', 'points']
