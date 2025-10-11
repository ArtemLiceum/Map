from django.shortcuts import render


def main(request):
    return render(request, "main.html")


def admin(request):
    return render(request, "admin.html")


def evac_plans(request):
    return render(request, "evac_plans.html")
