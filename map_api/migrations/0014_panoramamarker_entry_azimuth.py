from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('map_api', '0013_facility_and_evacplan_facility'),
    ]

    operations = [
        migrations.AddField(
            model_name='panoramamarker',
            name='entry_azimuth',
            field=models.FloatField(
                blank=True,
                null=True,
                help_text='Направление камеры при входе в целевую точку (0–360°). Пусто — авто.',
                verbose_name='Азимут входа',
            ),
        ),
    ]
