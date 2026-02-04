from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth import login, authenticate
from django.contrib.auth.forms import UserCreationForm
from django.contrib import messages
from django.http import HttpResponseForbidden
from map_api.models import EvacPlan

# Navigation template tags: front.templatetags.nav_tags


def is_admin(user):
    """Check if user is admin (staff)"""
    return user.is_authenticated and user.is_staff


def main(request):
    plans = EvacPlan.objects.all()
    return render(request, "main.html", {"plans": plans})


def evac_plans(request):
    return render(request, "evac_plans.html")


def faq(request):
    return render(request, "faq.html")


def tour_view(request, plan_id: int):
    # Render viewer; JS will pull data via API using plan_id.
    return render(request, "tour_view.html", {"plan_id": plan_id})

# Редактор (только для staff)
@user_passes_test(is_admin, login_url='admin_login')
def admin_editor(request):
    return render(request, "admin.html")

# TODO: redirect to admin panel
def admin_login(request):
    """Страница входа для администраторов"""
    if request.user.is_authenticated and request.user.is_staff:
        return redirect('admin')
    return render(request, "admin_login.html")


def register_view(request):
    """Страница регистрации нового пользователя"""
    if request.user.is_authenticated:
        return redirect('main')

    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            username = form.cleaned_data.get('username')
            messages.success(request, f'Аккаунт {username} успешно создан! Теперь вы можете войти.')
            # Автоматический вход после регистрации
            login(request, user)
            return redirect('main')
        else:
            for field, errors in form.errors.items():
                for error in errors:
                    messages.error(request, f'{error}')
    else:
        form = UserCreationForm()

    return render(request, "register.html", {'form': form})


def login_view(request):
    """Страница входа"""
    if request.user.is_authenticated:
        return redirect('main')

    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)

        if user is not None:
            login(request, user)
            # Перенаправление после успешного входа
            next_url = request.GET.get('next', 'main')
            messages.success(request, f'Добро пожаловать, {username}!')
            return redirect(next_url)
        else:
            messages.error(request, 'Неверное имя пользователя или пароль.')

    return render(request, "login.html")
