from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('map_api', '0015_evacplan_start_point'),
    ]

    operations = [
        migrations.AddField(
            model_name='evacplan',
            name='is_active',
            field=models.BooleanField(default=True, verbose_name='Активен'),
        ),
    ]
