from django.contrib import admin
from .models import EvacPlan, MapPoint, Panorama, PanoramaMarker


class PanoramaMarkerInline(admin.TabularInline):
    model = PanoramaMarker
    extra = 1
    fields = ('target_point', 'azimuth', 'pitch', 'label')


class PanoramaInline(admin.StackedInline):
    model = Panorama
    extra = 0
    fk_name = 'point'


class MapPointInline(admin.TabularInline):
    model = MapPoint
    extra = 1
    fields = ('name', 'type', 'x', 'y', 'info_text')


@admin.register(EvacPlan)
class EvacPlanAdmin(admin.ModelAdmin):
    list_display = ('title', 'floor', 'created_at')
    list_filter = ('floor',)
    search_fields = ('title',)
    ordering = ('floor', 'title')
    inlines = [MapPointInline]


@admin.register(MapPoint)
class MapPointAdmin(admin.ModelAdmin):
    list_display = ('name', 'plan', 'type', 'x', 'y')
    list_filter = ('type', 'plan')
    search_fields = ('name', 'info_text')
    inlines = [PanoramaInline]


@admin.register(Panorama)
class PanoramaAdmin(admin.ModelAdmin):
    list_display = ('point', 'get_point_plan')
    inlines = [PanoramaMarkerInline]

    @admin.display(description='План')
    def get_point_plan(self, obj):
        return obj.point.plan.title


@admin.register(PanoramaMarker)
class PanoramaMarkerAdmin(admin.ModelAdmin):
    list_display = ('panorama', 'target_point', 'label', 'azimuth', 'pitch')
    list_filter = ('panorama__point__plan',)
    search_fields = ('label', 'panorama__point__name', 'target_point__name')
