"""Запись действий API в django.contrib.admin.models.LogEntry."""

from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.contrib.contenttypes.models import ContentType

def log_drf_action(user, instance, action_flag, change_message=None):
    """
    Пишет запись в журнал админки для объекта instance.
    Для CHANGE без явного сообщения подставляется общая пометка «через API».
    """
    if not user or not user.is_authenticated:
        return
    if instance is None or instance.pk is None:
        return

    ct = ContentType.objects.get_for_model(instance.__class__)
    msg = change_message
    if msg is None:
        if action_flag == ADDITION:
            msg = []
        elif action_flag == DELETION:
            msg = []
        else:
            msg = [{"changed": {"fields": ["через API"]}}]

    LogEntry.objects.log_action(
        user_id=user.pk,
        content_type_id=ct.pk,
        object_id=str(instance.pk),
        object_repr=str(instance)[:200],
        action_flag=action_flag,
        change_message=msg,
    )


__all__ = ["log_drf_action", "ADDITION", "CHANGE", "DELETION"]
