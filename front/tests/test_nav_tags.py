from django.template import Context, Template
from django.test import RequestFactory, SimpleTestCase
from django.urls import ResolverMatch

from front.templatetags.nav_tags import is_nav_active, nav_active, nav_link


class NavTagsTests(SimpleTestCase):
    def setUp(self):
        super().setUp()
        self.factory = RequestFactory()

    def _context(self, url_name: str | None):
        request = self.factory.get("/")
        if url_name is not None:
            request.resolver_match = ResolverMatch(
                func=lambda: None,
                args=(),
                kwargs={},
                url_name=url_name,
                app_names=[],
                namespaces=[],
                route="/",
            )
        return Context({"request": request})

    def test_nav_active_returns_class_for_matching_route(self):
        ctx = self._context("main")
        self.assertEqual(nav_active(ctx, "main"), "active")
        self.assertEqual(nav_active(ctx, "other"), "")

    def test_nav_active_supports_additional_routes_and_custom_class(self):
        ctx = self._context("admin")
        self.assertEqual(nav_active(ctx, "main", "admin", css_class="selected"), "selected")

    def test_nav_active_without_request_returns_empty(self):
        self.assertEqual(nav_active(Context({}), "main"), "")

    def test_is_nav_active_boolean(self):
        ctx = self._context("evac_plans")
        self.assertTrue(is_nav_active(ctx, "evac_plans"))
        self.assertTrue(is_nav_active(ctx, "main", "evac_plans"))
        self.assertFalse(is_nav_active(ctx, "main"))

    def test_nav_link_renders_active_state(self):
        ctx = self._context("main")
        result = nav_link(ctx, "main", "Главная")
        self.assertEqual(result["label"], "Главная")
        self.assertTrue(result["is_active"])
        self.assertIn("url", result)

    def test_nav_link_unknown_route_falls_back_to_hash(self):
        ctx = self._context("main")
        result = nav_link(ctx, "definitely_missing_route_name", "X")
        self.assertEqual(result["url"], "#")

    def test_template_tag_integration(self):
        template = Template("{% load nav_tags %}{% nav_active 'main' %}")
        request = self.factory.get("/")
        request.resolver_match = ResolverMatch(
            func=lambda: None,
            args=(),
            kwargs={},
            url_name="main",
            app_names=[],
            namespaces=[],
            route="/",
        )
        rendered = template.render(Context({"request": request}))
        self.assertEqual(rendered.strip(), "active")
