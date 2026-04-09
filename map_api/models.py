from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


class EvacPlan(models.Model):
    """План эвакуации (карта здания / этаж)"""
    title = models.CharField(max_length=200, verbose_name="Название")
    floor = models.IntegerField(default=1, verbose_name="Этаж")
    image = models.ImageField(upload_to='evac_plans/', verbose_name="Изображение плана")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['floor', 'title']
        verbose_name = "План этажа"
        verbose_name_plural = "Планы этажей"

    def __str__(self):
        return f"{self.title} (этаж {self.floor})"


class MapPoint(models.Model):
    """Точка на плане эвакуации"""
    plan = models.ForeignKey(EvacPlan, related_name='points', on_delete=models.CASCADE)
    name = models.CharField(max_length=100, verbose_name="Название")
    x = models.FloatField(help_text="Координата X в процентах (0–100)")
    y = models.FloatField(help_text="Координата Y в процентах (0–100)")
    info_text = models.TextField(
        null=True,
        blank=True,
        default='',
        verbose_name="Информационный текст",
        help_text="Текст для info-точки (отображается при наведении)"
    )

    class Meta:
        ordering = ['id']
        verbose_name = "Точка на плане"
        verbose_name_plural = "Точки на плане"

    def __str__(self):
        return f"{self.plan.title} — {self.name}"


class Panorama(models.Model):
    """Панорамное изображение, связанное с точкой"""
    point = models.OneToOneField(MapPoint, related_name='panorama', on_delete=models.CASCADE)
    image = models.ImageField(upload_to='panoramas/', verbose_name="Панорама 360°")

    class Meta:
        verbose_name = "Панорама"
        verbose_name_plural = "Панорамы"

    def __str__(self):
        return f"Панорама: {self.point.name}"


class PanoramaMarker(models.Model):
    """Метка в панораме для перехода к следующей точке"""
    class MarkerType(models.TextChoices):
        TRANSITION = 'transition', 'Переходная (панорама)'
        INFO = 'info', 'Информационная'

    panorama = models.ForeignKey(Panorama, related_name='markers', on_delete=models.CASCADE)
    target_point = models.ForeignKey(
        MapPoint,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        verbose_name="Целевая точка",
        related_name='incoming_markers',
        help_text="Точка, на которую переходит панорама при нажатии на маркер"
    )
    azimuth = models.FloatField(
        help_text="Азимут направления на маркер (0–360°)",
        verbose_name="Азимут"
    )
    pitch = models.FloatField(
        default=0,
        help_text="Угол по вертикали (-90..90°)",
        verbose_name="Угол наклона"
    )
    label = models.CharField(
        max_length=100,
        blank=True,
        default='',
        verbose_name="Подпись перехода",
        help_text="Текст, отображаемый на маркере"
    )
    text = models.TextField(
        blank=True,
        default='',
        verbose_name="Текст информационной точки",
        help_text="Подробный текст для информационной метки"
    )
    type = models.CharField(
        max_length=20,
        choices=MarkerType.choices,
        default=MarkerType.TRANSITION,
        verbose_name="Тип точки"
    )

    class Meta:
        ordering = ['id']
        verbose_name = "Маркер перехода"
        verbose_name_plural = "Маркеры переходов"
        constraints = [
            models.CheckConstraint(
                check=Q(type='info') | Q(target_point__isnull=False),
                name="panoramamarker_transition_requires_target",
            ),
            models.CheckConstraint(
                check=Q(type='transition') | Q(target_point__isnull=True),
                name="panoramamarker_info_target_null",
            ),
        ]

    def __str__(self):
        if self.type == self.MarkerType.INFO:
            label = self.label or "Информация"
            return f"{self.panorama.point.name} [info: {label}]"
        target = getattr(self, "target_point", None)
        target_name = target.name if target else "—"
        return f"{self.panorama.point.name} → {target_name}"

    def clean(self):
        """Ensure target_point presence matches marker type."""
        super().clean()
        if self.type == self.MarkerType.TRANSITION and not self.target_point:
            raise ValidationError({"target_point": "Целевая точка обязательна для переходной метки."})
        if self.type == self.MarkerType.INFO and self.target_point:
            raise ValidationError({"target_point": "Для информационной метки целевая точка должна быть пустой."})


class Tour(models.Model):
    """Маршрут внутри плана (виртуального тура)"""
    plan = models.ForeignKey(EvacPlan, related_name='tours', on_delete=models.CASCADE)
    title = models.CharField(max_length=200, verbose_name="Название тура")
    is_active = models.BooleanField(default=True, verbose_name="Активен")
    created_at = models.DateTimeField(auto_now_add=True)
    markers = models.ManyToManyField(
        PanoramaMarker,
        related_name='tours',
        blank=True,
        through='TourMarker',
    )

    class Meta:
        ordering = ['plan_id', 'title']
        verbose_name = "Тур"
        verbose_name_plural = "Туры"
        constraints = [
            models.UniqueConstraint(
                fields=['plan', 'title'],
                name='tour_unique_plan_title',
            ),
        ]

    def __str__(self):
        return f"{self.plan.title}: {self.title}"


class TourMarker(models.Model):
    """Связь тура с информационными маркерами панорам"""
    tour = models.ForeignKey(Tour, related_name='tour_markers', on_delete=models.CASCADE)
    marker = models.ForeignKey(PanoramaMarker, related_name='tour_markers', on_delete=models.CASCADE)

    class Meta:
        verbose_name = "Метка тура"
        verbose_name_plural = "Метки тура"
        constraints = [
            models.UniqueConstraint(
                fields=['tour', 'marker'],
                name='tourmarker_unique_tour_marker',
            ),
        ]

    def clean(self):
        """Только информационные маркеры можно добавлять в тур."""
        super().clean()
        if self.marker_id and self.marker.type != PanoramaMarker.MarkerType.INFO:
            raise ValidationError(
                {"marker": "В тур можно добавлять только информационные маркеры (type=info)."}
            )

    def __str__(self):
        return f"{self.tour} ↔ {self.marker}"


class TourInfoMarkerView(models.Model):
    """Просмотренная пользователем info-метка внутри конкретного тура."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name='tour_info_marker_views',
        on_delete=models.CASCADE,
    )
    tour = models.ForeignKey(
        Tour,
        related_name='info_marker_views',
        on_delete=models.CASCADE,
    )
    marker = models.ForeignKey(
        PanoramaMarker,
        related_name='tour_views',
        on_delete=models.CASCADE,
    )
    viewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Просмотр метки тура"
        verbose_name_plural = "Просмотры меток туров"
        indexes = [
            models.Index(fields=['user', 'tour'], name='tourview_user_tour_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'tour', 'marker'],
                name='tourview_unique_user_tour_marker',
            ),
        ]

    def clean(self):
        super().clean()
        if self.marker_id and self.marker.type != PanoramaMarker.MarkerType.INFO:
            raise ValidationError({"marker": "Можно сохранять только информационные метки (type=info)."})
        if self.tour_id and self.marker_id:
            if not TourMarker.objects.filter(tour_id=self.tour_id, marker_id=self.marker_id).exists():
                raise ValidationError({"marker": "Метка должна быть привязана к выбранному туру."})

    def __str__(self):
        return f"{self.user} — {self.tour} — {self.marker}"


class RegistrationCodeWord(models.Model):
    """Единственное кодовое слово для регистрации (синглтон с pk=1)."""
    SOLO_PK = 1

    word = models.CharField(max_length=128, verbose_name="Кодовое слово")

    class Meta:
        verbose_name = "Кодовое слово регистрации"
        verbose_name_plural = "Кодовое слово регистрации"

    def __str__(self):
        return "Кодовое слово регистрации"

    @classmethod
    def get_solo(cls):
        try:
            return cls.objects.get(pk=cls.SOLO_PK)
        except cls.DoesNotExist:
            return None
