import re

from django import forms
from django.contrib.auth import get_user_model, password_validation


User = get_user_model()


class EmailRegistrationForm(forms.Form):
    email = forms.EmailField(
        required=True,
        widget=forms.EmailInput(attrs={"autocomplete": "email"}),
        label="Email",
    )
    password1 = forms.CharField(
        label="Пароль",
        strip=False,
        widget=forms.PasswordInput(attrs={"autocomplete": "new-password"}),
    )
    password2 = forms.CharField(
        label="Подтверждение пароля",
        strip=False,
        widget=forms.PasswordInput(attrs={"autocomplete": "new-password"}),
    )

    def clean_email(self):
        email = self.cleaned_data["email"].strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("Пользователь с таким email уже существует.")
        return email

    def clean(self):
        cleaned = super().clean()
        pw1 = cleaned.get("password1")
        pw2 = cleaned.get("password2")
        if pw1 and pw2 and pw1 != pw2:
            raise forms.ValidationError({"password2": "Пароли не совпадают."})

        email = cleaned.get("email")
        if email and pw1:
            password_validation.validate_password(pw1, user=User(email=email))
        return cleaned

    def _sanitize_username(self, raw: str) -> str:
        sanitized = re.sub(r"[^\w.@+-]+", "_", raw).strip("._-")
        return sanitized or "user"

    def _generate_unique_username(self, email: str) -> str:
        base_local = email.split("@", 1)[0]
        base = self._sanitize_username(base_local)[:20]  # keep base compact
        username = base
        counter = 1
        while User.objects.filter(username__iexact=username).exists():
            suffix = f"_{counter}"
            max_base_len = 150 - len(suffix)
            username = f"{base[:max_base_len]}{suffix}"
            counter += 1
        return username

    def save(self, commit: bool = True):
        email = self.cleaned_data["email"]
        password = self.cleaned_data["password1"]
        username = self._generate_unique_username(email)
        user = User(username=username, email=email)
        user.set_password(password)
        if commit:
            user.save()
        return user
