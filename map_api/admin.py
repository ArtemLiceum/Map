from django.contrib import admin
from .models import EvacPlan, MapPoint, Panorama, PanoramaMarker, PanoramaInfoPoint


class PanoramaMarkerInline(admin.TabularInline):
    model = PanoramaMarker
    extra = 1
    fields = ('target_point', 'azimuth', 'pitch', 'label')


class PanoramaInfoPointInline(admin.TabularInline):
    model = PanoramaInfoPoint
    extra = 1
    fields = ('title', 'text', 'azimuth', 'pitch')


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
    list_display = ('point', 'get_point_plan')
    inlines = [PanoramaMarkerInline, PanoramaInfoPointInline]


@admin.register(PanoramaMarker)
class PanoramaMarkerAdmin(admin.ModelAdmin):
    list_display = ('panorama', 'target_point', 'label', 'azimuth', 'pitch')
    list_filter = ('panorama__point__plan',)
    search_fields = ('label', 'panorama__point__name', 'target_point__name')


@admin.register(PanoramaInfoPoint)
class PanoramaInfoPointAdmin(admin.ModelAdmin):
    list_display = ('panorama', 'title', 'azimuth', 'pitch')
    list_filter = ('panorama__point__plan',)
    search_fields = ('title', 'text', 'panorama__point__name')
