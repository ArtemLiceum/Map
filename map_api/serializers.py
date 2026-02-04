from rest_framework import serializers
from .models import EvacPlan, MapPoint, Panorama, PanoramaMarker, PanoramaInfoPoint


class PanoramaMarkerSerializer(serializers.ModelSerializer):
    target_point_name = serializers.CharField(source='target_point.name', read_only=True)

    class Meta:
        model = PanoramaMarker
        fields = [
            'id', 'panorama', 'target_point', 'target_point_name',
            'azimuth', 'pitch', 'label'
        ]

    def validate_azimuth(self, value):
        """
        Azimuth is stored in degrees for equirectangular panoramas.
        Keep it inside [0..360]. Value 360 is normalized to 0.
        """
        if value is None:
            return value
        if value < 0 or value > 360:
            raise serializers.ValidationError('Азимут должен быть в диапазоне 0–360°.')
        # normalize the "right edge" to 0°
        if abs(value - 360) < 1e-9:
            return 0.0
        return value

    def validate_pitch(self, value):
        """Pitch is stored in degrees, must be inside [-90..90]."""
        if value is None:
            return value
        if value < -90 or value > 90:
            raise serializers.ValidationError('Угол наклона должен быть в диапазоне -90..90°.')
        return value


class PanoramaInfoPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = PanoramaInfoPoint
        fields = ['id', 'panorama', 'azimuth', 'pitch', 'title', 'text']

    def validate_azimuth(self, value):
        """
        An info-point must always be within panorama coordinates.
        Keep azimuth in [0..360]. Value 360 is normalized to 0.
        """
        if value is None:
            return value
        if value < 0 or value > 360:
            raise serializers.ValidationError('Азимут должен быть в диапазоне 0–360°.')
        if abs(value - 360) < 1e-9:
            return 0.0
        return value

    def validate_pitch(self, value):
        """An info-point must always be within panorama coordinates: [-90..90]."""
        if value is None:
            return value
        if value < -90 or value > 90:
            raise serializers.ValidationError('Угол наклона должен быть в диапазоне -90..90°.')
        return value


class PanoramaSerializer(serializers.ModelSerializer):
    markers = PanoramaMarkerSerializer(many=True, read_only=True)
    info_points = PanoramaInfoPointSerializer(many=True, read_only=True)

    class Meta:
        model = Panorama
        fields = ['id', 'point', 'image', 'markers', 'info_points']


class MapPointSerializer(serializers.ModelSerializer):
    panorama = PanoramaSerializer(read_only=True)

    class Meta:
        model = MapPoint
        fields = ['id', 'plan', 'name', 'type', 'x', 'y', 'info_text', 'panorama']

    def validate(self, attrs):
        """
        Информационные точки теперь размещаются внутри панорамы (hotspot),
        поэтому запрещаем создавать новые MapPoint с type=info через API.
        """
        attrs = super().validate(attrs)
        request = self.context.get('request')
        if request and request.method == 'POST':
            point_type = attrs.get('type')
            if point_type == MapPoint.TYPE_INFO:
                raise serializers.ValidationError({
                    'type': 'Информационные точки размещаются внутри панорамы, а не на плане.'
                })
        return attrs

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
        fields = ['id', 'title', 'image', 'points', 'created_at']
