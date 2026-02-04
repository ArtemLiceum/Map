from django.db import models


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
    TYPE_TRANSITION = 'transition'
    TYPE_INFO = 'info'
    TYPE_CHOICES = [
        (TYPE_TRANSITION, 'Переходная (панорама)'),
        (TYPE_INFO, 'Информационная'),
    ]

    plan = models.ForeignKey(EvacPlan, related_name='points', on_delete=models.CASCADE)
    name = models.CharField(max_length=100, verbose_name="Название")
    type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default=TYPE_TRANSITION,
        verbose_name="Тип точки"
    )
    x = models.FloatField(help_text="Координата X в процентах (0–100)")
    y = models.FloatField(help_text="Координата Y в процентах (0–100)")
    info_text = models.TextField(
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
        return f"{self.plan.title} — {self.name} ({self.type})"


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
    panorama = models.ForeignKey(Panorama, related_name='markers', on_delete=models.CASCADE)
    target_point = models.ForeignKey(
        MapPoint,
        on_delete=models.CASCADE,
        verbose_name="Целевая точка",
        related_name='incoming_markers'
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

    class Meta:
        ordering = ['id']
        verbose_name = "Маркер перехода"
        verbose_name_plural = "Маркеры переходов"

    def __str__(self):
        return f"{self.panorama.point.name} → {self.target_point.name}"
