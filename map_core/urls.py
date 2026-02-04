"""
URL configuration for map_core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.urls import path, include
from django.contrib import admin as django_admin
from front.views import main, evac_plans, faq, tour_view, admin_login, admin_editor, register_view, login_view
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.auth import views as auth_views


urlpatterns = [
    # Django admin
    path('django-admin/', django_admin.site.urls),

    # API
    path('api/', include('map_api.urls')),

    # Frontend pages
    path('', main, name='main'),
    path('evac_plans/', evac_plans, name='evac_plans'),
    path('faq/', faq, name='faq'),
    path('tour/<int:plan_id>/', tour_view, name='tour_view'),
    path('admin/', admin_editor, name='admin'),

    # Auth
    path('admin-login/', admin_login, name='admin_login'),
    path('login/', login_view, name='login'),
    path('register/', register_view, name='register'),
    path('logout/', auth_views.LogoutView.as_view(next_page='/'), name='logout'),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
