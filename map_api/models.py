from django.db import models


class EvacPlan(models.Model):
    """План эвакуации (карта здания)"""
    title = models.CharField(max_length=200)
    image = models.ImageField(upload_to='evac_plans/')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class MapPoint(models.Model):
    """Точка на плане эвакуации, переходящая в панораму"""
    plan = models.ForeignKey(EvacPlan, related_name='points', on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    x = models.FloatField(help_text="Координата X в процентах (0–100)")
    y = models.FloatField(help_text="Координата Y в процентах (0–100)")

    def __str__(self):
        return f"{self.plan.title} — {self.name}"


class Panorama(models.Model):
    """Панорамное изображение, связанное с точкой"""
    point = models.OneToOneField(MapPoint, related_name='panorama', on_delete=models.CASCADE)
    image = models.ImageField(upload_to='panoramas/')

    def __str__(self):
        return f"Panorama at {self.point.name}"


class PanoramaMarker(models.Model):
    """Метка в панораме для перехода к следующей точке"""
    panorama = models.ForeignKey(Panorama, related_name='markers', on_delete=models.CASCADE)
    target_point = models.ForeignKey(MapPoint, on_delete=models.CASCADE)
    azimuth = models.FloatField(help_text="Угол (в градусах) направления на маркер")
    pitch = models.FloatField(help_text="Угол (в градусах) по вертикали")

    def __str__(self):
        return f"{self.panorama.point.name} → {self.target_point.name}"


class PanoramaInfoPoint(models.Model):
    """Информационная точка внутри панорамы (hotspot)"""
    panorama = models.ForeignKey(Panorama, related_name='info_points', on_delete=models.CASCADE)
    azimuth = models.FloatField(
        help_text="Азимут направления на точку (0–360°)",
        verbose_name="Азимут"
    )
    pitch = models.FloatField(
        default=0,
        help_text="Угол по вертикали (-90..90°)",
        verbose_name="Угол наклона"
    )
    title = models.CharField(
        max_length=100,
        blank=True,
        default='',
        verbose_name="Заголовок",
        help_text="Короткая подпись (необязательно)"
    )
    text = models.TextField(
        blank=False,
        default='',
        verbose_name="Текст",
        help_text="Текст информационной точки (показывается при наведении/клике)"
    )

    class Meta:
        ordering = ['id']
        verbose_name = "Инфо-точка панорамы"
        verbose_name_plural = "Инфо-точки панорамы"

    def __str__(self):
        t = self.title or (self.text[:30] + ('…' if len(self.text) > 30 else ''))
        return f"Инфо: {self.panorama.point.name} — {t}"
