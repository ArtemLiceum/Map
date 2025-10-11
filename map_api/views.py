from rest_framework import viewsets
from .models import EvacPlan, MapPoint, Panorama, PanoramaMarker
from .serializers import (
    EvacPlanSerializer, MapPointSerializer,
    PanoramaSerializer, PanoramaMarkerSerializer
)


class EvacPlanViewSet(viewsets.ModelViewSet):
    queryset = EvacPlan.objects.all()
    serializer_class = EvacPlanSerializer


class MapPointViewSet(viewsets.ModelViewSet):
    queryset = MapPoint.objects.select_related('plan').all()
    serializer_class = MapPointSerializer


class PanoramaViewSet(viewsets.ModelViewSet):
    queryset = Panorama.objects.select_related('point').all()
    serializer_class = PanoramaSerializer


class PanoramaMarkerViewSet(viewsets.ModelViewSet):
    queryset = PanoramaMarker.objects.select_related('panorama', 'target_point').all()
    serializer_class = PanoramaMarkerSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        panorama_id = self.request.query_params.get('panorama')
        if panorama_id:
            qs = qs.filter(panorama_id=panorama_id)
        return qs
