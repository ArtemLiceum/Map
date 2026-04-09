from django.contrib import admin
from django.contrib.admin.models import ACTION_FLAG_CHOICES, LogEntry

from .models import EvacPlan, MapPoint, Panorama, PanoramaMarker, Tour, TourMarker, TourInfoMarkerView


@admin.register(LogEntry)
class LogEntryAdmin(admin.ModelAdmin):
    list_display = ("action_time", "user", "content_type", "object_repr", "action_flag_label")
    list_filter = ("action_time", "content_type", "user", "action_flag")
    search_fields = ("object_repr", "change_message")
    date_hierarchy = "action_time"
    readonly_fields = [f.name for f in LogEntry._meta.fields]

    @admin.display(description="Действие")
    def action_flag_label(self, obj):
        return dict(ACTION_FLAG_CHOICES).get(obj.action_flag, obj.action_flag)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


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


@admin.register(TourInfoMarkerView)
class TourInfoMarkerViewAdmin(admin.ModelAdmin):
    list_display = ('user', 'tour', 'marker', 'viewed_at')
    list_filter = ('tour__plan', 'tour', 'user')
    search_fields = ('user__username', 'user__email', 'tour__title', 'marker__label')
    ordering = ('-viewed_at',)


# @admin.register(PanoramaInfoPoint)
# class PanoramaInfoPointAdmin(admin.ModelAdmin):
#     list_display = ('panorama', 'title', 'azimuth', 'pitch')
#     list_filter = ('panorama__point__plan',)
#     search_fields = ('title', 'text', 'panorama__point__name')
