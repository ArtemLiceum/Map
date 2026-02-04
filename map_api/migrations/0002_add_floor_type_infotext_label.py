# Generated migration for adding floor, type, info_text, label fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('map_api', '0001_initial'),
    ]

    operations = [
        # EvacPlan.floor
        migrations.AddField(
            model_name='evacplan',
            name='floor',
            field=models.IntegerField(default=1, verbose_name='Этаж'),
        ),

        # MapPoint.type
        migrations.AddField(
            model_name='mappoint',
            name='type',
            field=models.CharField(
                choices=[('transition', 'Переходная (панорама)'), ('info', 'Информационная')],
                default='transition',
                max_length=20,
                verbose_name='Тип точки'
            ),
        ),

        # MapPoint.info_text
        migrations.AddField(
            model_name='mappoint',
            name='info_text',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Текст для info-точки (отображается при наведении)',
                verbose_name='Информационный текст'
            ),
        ),

        # PanoramaMarker.label
        migrations.AddField(
            model_name='panoramamarker',
            name='label',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Текст, отображаемый на маркере',
                max_length=100,
                verbose_name='Подпись перехода'
            ),
        ),

        # Update EvacPlan meta
        migrations.AlterModelOptions(
            name='evacplan',
            options={
                'ordering': ['floor', 'title'],
                'verbose_name': 'План этажа',
                'verbose_name_plural': 'Планы этажей'
            },
        ),

        # Update MapPoint meta
        migrations.AlterModelOptions(
            name='mappoint',
            options={
                'ordering': ['id'],
                'verbose_name': 'Точка на плане',
                'verbose_name_plural': 'Точки на плане'
            },
        ),

        # Update Panorama meta
        migrations.AlterModelOptions(
            name='panorama',
            options={
                'verbose_name': 'Панорама',
                'verbose_name_plural': 'Панорамы'
            },
        ),

        # Update PanoramaMarker meta
        migrations.AlterModelOptions(
            name='panoramamarker',
            options={
                'ordering': ['id'],
                'verbose_name': 'Маркер перехода',
                'verbose_name_plural': 'Маркеры переходов'
            },
        ),

        # Update field verbose names
        migrations.AlterField(
            model_name='evacplan',
            name='title',
            field=models.CharField(max_length=200, verbose_name='Название'),
        ),
        migrations.AlterField(
            model_name='evacplan',
            name='image',
            field=models.ImageField(upload_to='evac_plans/', verbose_name='Изображение плана'),
        ),
        migrations.AlterField(
            model_name='mappoint',
            name='name',
            field=models.CharField(max_length=100, verbose_name='Название'),
        ),
        migrations.AlterField(
            model_name='panorama',
            name='image',
            field=models.ImageField(upload_to='panoramas/', verbose_name='Панорама 360°'),
        ),
        migrations.AlterField(
            model_name='panoramamarker',
            name='target_point',
            field=models.ForeignKey(
                on_delete=models.CASCADE,
                related_name='incoming_markers',
                to='map_api.mappoint',
                verbose_name='Целевая точка'
            ),
        ),
        migrations.AlterField(
            model_name='panoramamarker',
            name='azimuth',
            field=models.FloatField(
                help_text='Азимут направления на маркер (0–360°)',
                verbose_name='Азимут'
            ),
        ),
        migrations.AlterField(
            model_name='panoramamarker',
            name='pitch',
            field=models.FloatField(
                default=0,
                help_text='Угол по вертикали (-90..90°)',
                verbose_name='Угол наклона'
            ),
        ),
    ]
