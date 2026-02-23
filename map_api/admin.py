from django.contrib import admin
from .models import EvacPlan, MapPoint, Panorama, PanoramaMarker, Tour, TourMarker


class PanoramaMarkerInline(admin.TabularInline):
    model = PanoramaMarker
    extra = 1
    fields = ('type', 'target_point', 'azimuth', 'pitch', 'label', 'text')


class PanoramaInline(admin.StackedInline):
    model = Panorama
    extra = 0
    fk_name = 'point'


class MapPointInline(admin.TabularInline):
    model = MapPoint
    extra = 1
    fields = ('name', 'x', 'y', 'info_text')


@admin.register(EvacPlan)
class EvacPlanAdmin(admin.ModelAdmin):
    list_display = ('title', 'floor', 'created_at')
    list_filter = ('floor',)
    search_fields = ('title',)
    ordering = ('floor', 'title')
    inlines = [MapPointInline]


@admin.register(MapPoint)
class MapPointAdmin(admin.ModelAdmin):
    list_display = ('name', 'plan', 'x', 'y')
    list_filter = ('plan',)
    search_fields = ('name', 'info_text')
    inlines = [PanoramaInline]


@admin.register(Panorama)
class PanoramaAdmin(admin.ModelAdmin):
    # list_display = ('point', 'get_point_plan')
    # inlines = [PanoramaMarkerInline, PanoramaInfoPointInline]
    pass


@admin.register(PanoramaMarker)
class PanoramaMarkerAdmin(admin.ModelAdmin):
    list_display = ('panorama', 'type', 'target_point', 'label', 'azimuth', 'pitch')
    list_filter = ('panorama__point__plan',)
    search_fields = ('label', 'text', 'panorama__point__name', 'target_point__name')


@admin.register(Tour)
class TourAdmin(admin.ModelAdmin):
    list_display = ('title', 'plan', 'is_active', 'created_at')
    list_filter = ('plan', 'is_active')
    search_fields = ('title',)


@admin.register(TourMarker)
class TourMarkerAdmin(admin.ModelAdmin):
    list_display = ('tour', 'marker')
    list_filter = ('tour__plan',)


# @admin.register(PanoramaInfoPoint)
# class PanoramaInfoPointAdmin(admin.ModelAdmin):
#     list_display = ('panorama', 'title', 'azimuth', 'pitch')
#     list_filter = ('panorama__point__plan',)
#     search_fields = ('title', 'text', 'panorama__point__name')
