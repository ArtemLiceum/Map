from django.contrib import admin
from .models import EvacPlan, MapPoint, Panorama, PanoramaMarker


class PanoramaMarkerInline(admin.TabularInline):
    model = PanoramaMarker
    extra = 1


class PanoramaInline(admin.StackedInline):
    model = Panorama
    extra = 0
    inlines = [PanoramaMarkerInline]
    fk_name = 'point'


class MapPointInline(admin.TabularInline):
    model = MapPoint
    extra = 1


@admin.register(EvacPlan)
class EvacPlanAdmin(admin.ModelAdmin):
    list_display = ('title', 'created_at')
    inlines = [MapPointInline]


@admin.register(MapPoint)
class MapPointAdmin(admin.ModelAdmin):
    list_display = ('name', 'plan', 'x', 'y')
    inlines = [PanoramaInline]


@admin.register(Panorama)
class PanoramaAdmin(admin.ModelAdmin):
    list_display = ('point',)
    inlines = [PanoramaMarkerInline]


@admin.register(PanoramaMarker)
class PanoramaMarkerAdmin(admin.ModelAdmin):
    list_display = ('panorama', 'target_point', 'azimuth', 'pitch')
