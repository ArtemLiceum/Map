from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('map_api', '0009_alter_mappoint_info_text'),
    ]

    operations = [
        migrations.CreateModel(
            name='Tour',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200, verbose_name='Название тура')),
                ('is_active', models.BooleanField(default=True, verbose_name='Активен')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('plan', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tours', to='map_api.evacplan')),
            ],
            options={
                'verbose_name': 'Тур',
                'verbose_name_plural': 'Туры',
                'ordering': ['plan_id', 'title'],
            },
        ),
        migrations.CreateModel(
            name='TourMarker',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('marker', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tour_markers', to='map_api.panoramamarker')),
                ('tour', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tour_markers', to='map_api.tour')),
            ],
            options={
                'verbose_name': 'Метка тура',
                'verbose_name_plural': 'Метки тура',
            },
        ),
        migrations.AddConstraint(
            model_name='tour',
            constraint=models.UniqueConstraint(fields=('plan', 'title'), name='tour_unique_plan_title'),
        ),
        migrations.AddConstraint(
            model_name='tourmarker',
            constraint=models.UniqueConstraint(fields=('tour', 'marker'), name='tourmarker_unique_tour_marker'),
        ),
    ]
