from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('map_api', '0010_tour_and_tourmarker'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='TourInfoMarkerView',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('viewed_at', models.DateTimeField(auto_now_add=True)),
                ('marker', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tour_views', to='map_api.panoramamarker')),
                ('tour', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='info_marker_views', to='map_api.tour')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tour_info_marker_views', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Просмотр метки тура',
                'verbose_name_plural': 'Просмотры меток туров',
            },
        ),
        migrations.AddIndex(
            model_name='tourinfomarkerview',
            index=models.Index(fields=['user', 'tour'], name='tourview_user_tour_idx'),
        ),
        migrations.AddConstraint(
            model_name='tourinfomarkerview',
            constraint=models.UniqueConstraint(fields=('user', 'tour', 'marker'), name='tourview_unique_user_tour_marker'),
        ),
    ]
