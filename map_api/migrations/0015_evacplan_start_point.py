from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('map_api', '0014_panoramamarker_entry_azimuth'),
    ]

    operations = [
        migrations.AddField(
            model_name='evacplan',
            name='start_point',
            field=models.ForeignKey(
                blank=True,
                help_text='Точка, с которой начинается просмотр. Пусто — первая точка с панорамой.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='map_api.mappoint',
                verbose_name='Начальная точка тура',
            ),
        ),
    ]
