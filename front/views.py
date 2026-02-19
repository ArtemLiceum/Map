from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth import login, authenticate
from django.contrib import messages
from django.http import HttpResponseForbidden
from django.views.decorators.csrf import ensure_csrf_cookie
from map_api.models import EvacPlan
from .forms import EmailRegistrationForm

# Navigation template tags: front.templatetags.nav_tags


def is_admin(user):
    """Check if user is admin (staff)"""
    return user.is_authenticated and user.is_staff


def is_superadmin(user):
    """Check if user is superuser"""
    return user.is_authenticated and user.is_superuser


def main(request):
    plans = EvacPlan.objects.all()
    return render(request, "main.html", {"plans": plans})


@ensure_csrf_cookie
def evac_plans(request):
    # Public page, but it can contain admin actions via JS (DELETE, etc.).
    # Ensure CSRF cookie is set so SessionAuthentication can validate unsafe methods.
    return render(request, "evac_plans.html")


def faq(request):
    return render(request, "faq.html")


def tour_view(request, plan_id: int):
    # Render viewer; JS will pull data via API using plan_id.
    return render(request, "tour_view.html", {"plan_id": plan_id})

# Редактор (только для staff)
@user_passes_test(is_admin, login_url='admin_login')
@ensure_csrf_cookie
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
        form = EmailRegistrationForm(request.POST)
        if form.is_valid():
            user = form.save()
            messages.success(request, f'Аккаунт для {user.email} успешно создан! Теперь вы можете войти.')
            # Автоматический вход после регистрации
            login(request, user, backend='map_core.auth_backends.EmailBackend')
            return redirect('main')
        else:
            for field, errors in form.errors.items():
                for error in errors:
                    messages.error(request, f'{error}')
    else:
        form = EmailRegistrationForm()

    return render(request, "register.html", {'form': form})


def login_view(request):
    """Страница входа"""
    if request.user.is_authenticated:
        return redirect('main')

    if request.method == 'POST':
        email = request.POST.get('email')
        password = request.POST.get('password')
        user = authenticate(request, email=email, password=password)

        if user is not None:
            login(request, user)
            # Перенаправление после успешного входа
            next_url = request.GET.get('next', 'main')
            messages.success(request, f'Добро пожаловать, {user.email}!')
            return redirect(next_url)
        else:
            messages.error(request, 'Неверный email или пароль.')

    return render(request, "login.html")


@user_passes_test(is_superadmin, login_url='admin_login')
@ensure_csrf_cookie
def users_list(request):
    return render(request, "users_list.html")


@user_passes_test(is_superadmin, login_url='admin_login')
@ensure_csrf_cookie
def user_edit(request, user_id: int):
    return render(request, "user_edit.html", {"user_id": user_id})
