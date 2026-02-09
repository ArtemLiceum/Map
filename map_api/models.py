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
