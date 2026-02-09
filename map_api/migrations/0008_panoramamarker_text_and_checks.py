from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ('map_api', '0007_alter_panoramamarker_target_point'),
    ]

    operations = [
        migrations.AddField(
            model_name='panoramamarker',
            name='text',
            field=models.TextField(blank=True, default='', help_text='Подробный текст для информационной метки', verbose_name='Текст информационной точки'),
        ),
        migrations.AddConstraint(
            model_name='panoramamarker',
            constraint=models.CheckConstraint(
                check=Q(type='info') | Q(target_point__isnull=False),
                name='panoramamarker_transition_requires_target',
            ),
        ),
        migrations.AddConstraint(
            model_name='panoramamarker',
            constraint=models.CheckConstraint(
                check=Q(type='transition') | Q(target_point__isnull=True),
                name='panoramamarker_info_target_null',
            ),
        ),
    ]
