"""
Кастомные template tags для навигации.

Позволяют определить активный пункт меню на основе текущего URL,
сохраняя разделение логики от представления.
"""

from django import template
from django.urls import reverse, NoReverseMatch

register = template.Library()


@register.simple_tag(takes_context=True)
def nav_active(context, url_name, *additional_url_names, css_class='active'):
    """
    Возвращает CSS-класс 'active', если текущая страница соответствует
    одному из переданных имён маршрутов.

    Использование:
        {% nav_active 'main' %}
        {% nav_active 'evac_plans' 'admin' %}
        {% nav_active 'main' css_class='selected' %}

    Args:
        url_name: Основное имя маршрута для проверки
        additional_url_names: Дополнительные имена маршрутов (для разделов с несколькими страницами)
        css_class: CSS-класс для активного состояния (по умолчанию 'active')

    Returns:
        CSS-класс если страница активна, иначе пустую строку
    """
    request = context.get('request')
    if not request:
        return ''

    resolver_match = getattr(request, 'resolver_match', None)
    if not resolver_match:
        return ''

    current_url_name = resolver_match.url_name

    # Собираем все имена маршрутов для проверки
    url_names_to_check = [url_name] + list(additional_url_names)

    if current_url_name in url_names_to_check:
        return css_class

    return ''


@register.simple_tag(takes_context=True)
def is_nav_active(context, url_name, *additional_url_names):
    """
    Проверяет, активен ли указанный раздел навигации.
    Возвращает True/False для использования в условных конструкциях.

    Использование:
        {% is_nav_active 'main' as is_main %}
        {% if is_main %}...{% endif %}
    """
    request = context.get('request')
    if not request:
        return False

    resolver_match = getattr(request, 'resolver_match', None)
    if not resolver_match:
        return False

    current_url_name = resolver_match.url_name
    url_names_to_check = [url_name] + list(additional_url_names)

    return current_url_name in url_names_to_check


@register.inclusion_tag('components/nav_link.html', takes_context=True)
def nav_link(context, url_name, label, *additional_url_names):
    """
    Рендерит навигационную ссылку с автоматическим определением активного состояния.

    Использование:
        {% nav_link 'main' 'Главная' %}
        {% nav_link 'evac_plans' 'Редактор карт' 'admin' %}

    Требует создания шаблона components/nav_link.html
    """
    request = context.get('request')
    is_active = False

    if request:
        resolver_match = getattr(request, 'resolver_match', None)
        if resolver_match:
            current_url_name = resolver_match.url_name
            url_names_to_check = [url_name] + list(additional_url_names)
            is_active = current_url_name in url_names_to_check

    try:
        url = reverse(url_name)
    except NoReverseMatch:
        url = '#'

    return {
        'url': url,
        'label': label,
        'is_active': is_active,
        'url_name': url_name,
    }
