from app.core.config import Settings


def test_google_settings_accept_canonical_env_keys(monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "canonical-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "canonical-secret")

    settings = Settings(_env_file=None)

    assert settings.google_client_id == "canonical-client"
    assert settings.google_client_secret == "canonical-secret"


def test_google_settings_accept_mixed_case_env_keys(monkeypatch) -> None:
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.setenv("GOOGLE_Client_ID", "mixed-client")
    monkeypatch.setenv("GOOGLE_Client_Secret", "mixed-secret")

    settings = Settings(_env_file=None)

    assert settings.google_client_id == "mixed-client"
    assert settings.google_client_secret == "mixed-secret"
