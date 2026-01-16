from django.shortcuts import render


def main(request):
    return render(request, "main.html")


def admin(request):
    return render(request, "admin.html")


def evac_plans(request):
    return render(request, "evac_plans.html")


def tour_view(request, plan_id: int):
    # Render viewer; JS will pull data via API using plan_id.
    return render(request, "tour_view.html", {"plan_id": plan_id})
